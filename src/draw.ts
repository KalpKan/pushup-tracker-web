/**
 * Canvas overlay: the video frame, the skeleton, and one diagnostic annotation.
 *
 * Since the "Gym mirror" redesign (docs/design/spec.md §3) the count, the verdict, the placement hint and
 * the rep result are DOM elements positioned over this canvas, not `fillText` calls: canvas text is
 * rasterised at the video's 640 px and upscaled to 960 CSS px, which is exactly where the page's hero
 * number must NOT be soft, and canvas text is invisible to assistive technology. What stays here is the
 * thing that genuinely belongs on the pixels — the skeleton, treated as a designed object
 * (`technical-wireframe-info-layout`): consistent stroke weights, filled joint dots, a grey paused state,
 * and a single routed connector from the joint responsible for a held fault to its measured number.
 */
import type { Point3 } from "./features";

// Body connections of the 33-point MediaPipe pose (face points left out on purpose).
const CONNECTIONS: readonly [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
];

export interface Overlay {
  landmarks: readonly Point3[] | null;
  /** Only the skeleton's colour still depends on the live verdict; its words live in the DOM HUD. */
  verdict: { good: boolean } | null;
  mirror: boolean;
  /** Counting is paused while a placement hint is up: the whole skeleton turns grey. */
  paused?: boolean;
  /**
   * The joint responsible for the fault currently held, in normalised (pre-mirror) coordinates, with the
   * measurement that made it a fault. Null whenever the form is clean, paused, or the fault is a
   * bottom-window verdict that no single joint explains.
   */
  annotation: { jx: number; jy: number; text: string } | null;
}

const GOOD = "#5ee38a";
const BAD = "#ff6b6b";
const PAUSED = "#b8b8b8";
/** Matches --plate / --line in src/style.css so the canvas label and the DOM HUD are one material. */
const PLATE = "rgba(15,17,22,0.78)";
const PLATE_EDGE = "rgba(255,255,255,0.12)";
const CONNECTOR = "rgba(255,255,255,0.55)";

export function draw(ctx: CanvasRenderingContext2D, source: CanvasImageSource, o: Overlay): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.save();
  if (o.mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, w, h);
  if (o.landmarks) {
    const good = o.verdict?.good ?? true;
    const stroke = o.paused ? PAUSED : good ? GOOD : BAD;
    // 2 px bones and 4 px joint dots at the 640 px canvas the camera and the demo clip both produce,
    // scaled with the canvas so a larger source keeps the same optical weight.
    ctx.lineWidth = Math.max(2, w / 320);
    ctx.lineCap = "round";
    ctx.strokeStyle = stroke;
    ctx.fillStyle = o.paused ? PAUSED : "#ffffff";
    for (const [a, b] of CONNECTIONS) {
      const pa = o.landmarks[a];
      const pb = o.landmarks[b];
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
    for (let i = 11; i < o.landmarks.length; i++) {
      const p = o.landmarks[i];
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, Math.max(3, w / 160), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Everything below is drawn unmirrored so the text always reads left to right.
  if (o.annotation) {
    const jx = (o.mirror ? 1 - o.annotation.jx : o.annotation.jx) * w;
    const jy = o.annotation.jy * h;
    // Route the connector towards the roomier side of the frame.
    const right = jx < w / 2;
    const dir = right ? 1 : -1;
    const bendX = jx + dir * w * 0.07;
    const endX = jx + dir * w * 0.16;
    const endY = jy - h * 0.1;
    ctx.strokeStyle = CONNECTOR;
    ctx.lineWidth = Math.max(1, w / 900);
    ctx.beginPath();
    ctx.moveTo(jx, jy);
    ctx.lineTo(bendX, endY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.fillStyle = CONNECTOR;
    ctx.beginPath();
    ctx.arc(jx, jy, Math.max(2, w / 260), 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 ${Math.max(10, Math.round(w / 52))}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = right ? "left" : "right";
    plate(ctx, o.annotation.text, endX + dir * 8, endY, right);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

/** The mono micro-label on the same dark plate the DOM HUD uses. */
function plate(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, right: boolean): void {
  const m = ctx.measureText(text);
  const padX = 7;
  const padY = 5;
  const asc = m.actualBoundingBoxAscent || 8;
  const desc = m.actualBoundingBoxDescent || 2;
  const boxX = (right ? x : x - m.width) - padX;
  const boxY = y - asc / 2 - padY - (asc - desc) / 4;
  const boxW = m.width + padX * 2;
  const boxH = asc + desc + padY * 2;
  ctx.fillStyle = PLATE;
  ctx.strokeStyle = PLATE_EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, boxY + boxH / 2);
}
