/** Canvas overlay: the video frame, the skeleton, the rep count, the form verdict with its reason, hints. */
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
  goodReps: number;
  totalReps: number;
  /** Smoothed per-frame verdict, or null when no pose is visible. */
  verdict: { good: boolean; reason: string | null } | null;
  mirror: boolean;
  /** Camera-placement hint (bottom centre). */
  hint: string | null;
  /** The rep that just finished, or a partial-dip notice (centre). */
  flash: { text: string; good: boolean } | null;
}

const GOOD = "#5ee38a";
const BAD = "#ff6b6b";

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
    ctx.lineWidth = Math.max(2, w / 240);
    ctx.strokeStyle = good ? GOOD : BAD;
    ctx.fillStyle = "#ffffff";
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

  // Text is never mirrored.
  const pad = Math.max(8, w / 60);
  const big = Math.max(20, Math.round(w / 14));
  const small = Math.max(13, Math.round(w / 30));
  ctx.font = `700 ${big}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  label(ctx, `${o.goodReps}`, pad, pad, "#ffe66d");
  ctx.font = `600 ${small}px system-ui, sans-serif`;
  label(ctx, `good rep${o.goodReps === 1 ? "" : "s"} · ${o.totalReps} attempt${o.totalReps === 1 ? "" : "s"}`, pad, pad + big + 4, "#ffffff");
  if (o.verdict) {
    const text = o.verdict.good ? "Good form" : `Bad form: ${o.verdict.reason ?? "unsure"}`;
    label(ctx, text, pad, pad + big + small + 12, o.verdict.good ? GOOD : BAD);
  }
  if (o.flash) {
    ctx.font = `700 ${Math.round(small * 1.25)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    label(ctx, o.flash.text, w / 2, h / 2 - small, o.flash.good ? GOOD : BAD, true);
    ctx.textAlign = "left";
  }
  if (o.hint) {
    ctx.font = `600 ${small}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    label(ctx, o.hint, w / 2, h - pad - small - 8, "#ffffff", true);
    ctx.textAlign = "left";
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, centered = false): void {
  const m = ctx.measureText(text);
  const hgt = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 8;
  const x0 = centered ? x - m.width / 2 - 6 : x - 6;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x0, y - 4, m.width + 12, hgt);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
