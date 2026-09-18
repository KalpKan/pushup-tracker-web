import "./style.css";
import { bootAnalytics, capture } from "./track";
import type { Session, Mode } from "./session";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("canvas");
const status = $<HTMLParagraphElement>("status");
const startBtn = $<HTMLButtonElement>("start-camera");
const demoBtn = $<HTMLButtonElement>("play-demo");
const stopBtn = $<HTMLButtonElement>("stop");
const goodEl = $<HTMLElement>("stat-good");
const totalEl = $<HTMLElement>("stat-total");
const formEl = $<HTMLElement>("stat-form");
const fpsEl = $<HTMLElement>("stat-fps");
const stage = $<HTMLElement>("stage");

let session: Session | null = null;
let starting = false;

function setStatus(text: string) {
  status.textContent = text;
}

function setButtons(active: boolean) {
  startBtn.disabled = active || starting;
  demoBtn.disabled = active || starting;
  stopBtn.hidden = !active;
}

async function start(mode: Mode) {
  if (session || starting) return;
  starting = true;
  setButtons(false);
  goodEl.textContent = "0";
  totalEl.textContent = "0";
  formEl.textContent = "–";
  fpsEl.textContent = "–";
  stage.classList.add("live");
  try {
    const { startSession } = await import("./session");
    session = await startSession({
      mode,
      video,
      canvas,
      onStatus: setStatus,
      onRep: (ev) => {
        goodEl.textContent = String(ev.goodReps);
        totalEl.textContent = String(ev.totalReps);
        capture("rep_counted", { good: ev.good });
      },
      onFrame: (st, prob, fps) => {
        goodEl.textContent = String(st.goodReps);
        totalEl.textContent = String(st.totalReps);
        formEl.textContent = prob == null ? "no pose" : prob > 0.5 ? `good ${Math.round(prob * 100)}%` : `bad ${Math.round((1 - prob) * 100)}%`;
        fpsEl.textContent = fps ? `${fps} fps` : "–";
      },
      onEnd: () => {
        session = null;
        setButtons(false);
        setStatus("Clip finished. Play it again or start your camera.");
      },
    });
    capture("session_started", { mode });
    if (mode === "demo") capture("demo_video_played", {});
    setButtons(true);
  } catch (err) {
    session = null;
    stage.classList.remove("live");
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(
      /NotAllowed|Permission|denied/i.test(msg)
        ? "Camera permission was refused. You can still watch the demo clip."
        : `Could not start: ${msg}`,
    );
    setButtons(false);
  } finally {
    starting = false;
    setButtons(session != null);
  }
}

startBtn.addEventListener("click", () => start("camera"));
demoBtn.addEventListener("click", () => start("demo"));
stopBtn.addEventListener("click", () => {
  session?.stop();
  session = null;
  setButtons(false);
  setStatus("Stopped.");
});

if (!navigator.mediaDevices?.getUserMedia) {
  startBtn.disabled = true;
  setStatus("This browser has no camera API; the demo clip still works.");
}

bootAnalytics();
