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
  // On a phone the header and buttons push the stage below the fold; bring the video and the tiles into view.
  if (window.innerWidth <= 480) stage.scrollIntoView({ block: "start", behavior: "smooth" });
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
        capture("rep_counted", { good: ev.good, reason: ev.reason });
      },
      onFrame: (st, verdict, fps, _hint, paused) => {
        goodEl.textContent = String(st.goodReps);
        totalEl.textContent = String(st.totalReps);
        formEl.textContent = paused ? "paused" : verdict == null ? "no pose" : verdict.good ? "good" : `bad: ${verdict.reason ?? "unsure"}`;
        fpsEl.textContent = fps ? `${fps} fps` : "–";
      },
      onEnd: () => {
        const result = `${goodEl.textContent} good of ${totalEl.textContent}`;
        session = null;
        setButtons(false);
        setStatus(`Clip finished: ${result}. Play it again or start your camera.`);
      },
      onError: (err) => {
        session = null;
        stage.classList.remove("live");
        formEl.textContent = "–";
        fpsEl.textContent = "–";
        setButtons(false);
        setStatus(`Something went wrong: ${err.message}. Reload the page and try again.`);
        capture("session_failed", { mode, message: err.message.slice(0, 160) });
      },
    });
    capture("session_started", { mode });
    if (mode === "demo") capture("demo_video_played", {});
    setButtons(true);
  } catch (err) {
    session = null;
    stage.classList.remove("live");
    const msg = err instanceof Error ? err.message : String(err);
    const refused = /NotAllowed|Permission|denied/i.test(msg);
    setStatus(refused ? "Camera permission was refused. You can still watch the demo clip." : `Could not start: ${msg}. Reload the page and try again.`);
    if (!refused) capture("session_failed", { mode, message: msg.slice(0, 160) });
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
  setStatus(`Stopped: ${goodEl.textContent} good rep${goodEl.textContent === "1" ? "" : "s"} of ${totalEl.textContent} attempt${totalEl.textContent === "1" ? "" : "s"}.`);
  formEl.textContent = "–";
  fpsEl.textContent = "–";
});

if (!navigator.mediaDevices?.getUserMedia) {
  startBtn.disabled = true;
  setStatus("This browser has no camera API; the demo clip still works.");
}

bootAnalytics();
