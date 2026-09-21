/**
 * The view layer of the "Gym mirror" design (docs/design/spec.md): it owns the HUD that sits on the glass
 * — the count, the placement hint, the form verdict and the attempts/speed line — and the one piece of
 * motion the page has, the 180 ms accent pulse on the stage frame when a rep is counted. It judges
 * nothing: every number and every word here comes from session.ts's callbacks.
 */
import "./style.css";
import { bootAnalytics, capture } from "./track";
import type { Session, Mode, RepResult } from "./session";

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
const hintEl = $<HTMLElement>("hud-hint");
const attemptsWord = $<HTMLElement>("attempts-word");
const verdictBox = $<HTMLElement>("hud-verdict");
const stage = $<HTMLElement>("stage");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let session: Session | null = null;
let starting = false;
/** A measured rate under SLOW_FPS for SLOW_MS shows a one-line warning under the count (TEST r3 D6: an 8 fps device silently lost a fast rep). */
const SLOW_FPS = 8;
const SLOW_MS = 2000;
/** Matches --d-out in style.css. */
/** Safety net: the 180 ms pulse attribute is normally removed by its own `animationend`. */
const PULSE_FALLBACK_MS = 1200;
/** Matches --d-out in style.css. */
const HINT_OUT_MS = 400;
const IDLE = "—";

let slowSince: number | null = null;
let slowWarned = false;

function setStatus(text: string) {
  status.textContent = text;
}

function setButtons(active: boolean) {
  startBtn.disabled = active || starting;
  demoBtn.disabled = active || starting;
  stopBtn.hidden = !active;
}

/* ---------- the verdict plate (bottom centre) ---------- */

type Tone = "good" | "bad" | "paused" | "neutral";

let verdictShown = "";

function setVerdict(text: string, tone: Tone) {
  if (text === verdictShown) {
    verdictBox.dataset.tone = tone;
    return;
  }
  verdictShown = text;
  verdictBox.dataset.tone = tone;
  formEl.textContent = text;
  if (reduceMotion.matches) return;
  // 120 ms: the new word arrives. The plate is never empty and the old word is never animated out —
  // a blink would hide the one thing a visitor on the floor is reading.
  verdictBox.classList.remove("is-swap");
  void verdictBox.offsetWidth;
  verdictBox.classList.add("is-swap");
}

/**
 * The word on the plate, exactly as the tracker emits it (docs/design/spec.md COPY). The rep that just
 * finished wins for as long as session.ts holds it, so the plate and the skeleton always agree.
 */
function verdictWords(paused: boolean, verdict: { good: boolean; reason: string | null } | null, result: RepResult | null): [string, Tone] {
  // Paused first: the skeleton is grey the moment counting stops, and a held "clean" over a grey body
  // would tell the visitor nothing is wrong at the one moment something is (reviewer, 2026-09-21).
  if (paused) return ["paused", "paused"];
  if (result) return result.good ? ["clean", "good"] : [result.reason ?? "unsure", "bad"];
  if (verdict == null) return ["no pose", "neutral"];
  return verdict.good ? ["clean", "good"] : [verdict.reason ?? "unsure", "bad"];
}

/* ---------- the placement hint (top right) ---------- */

let hintShown: string | null = null;
let hintTimer: number | undefined;

function setHint(text: string | null) {
  if (text === hintShown) return;
  hintShown = text;
  window.clearTimeout(hintTimer);
  if (text) {
    hintEl.textContent = text;
    if (hintEl.hidden) {
      hintEl.hidden = false;
      hintEl.dataset.state = "out";
      void hintEl.offsetWidth; // commit the out state so the 200 ms fade-in has somewhere to start
    }
    hintEl.dataset.state = "in";
  } else {
    hintEl.dataset.state = "out";
    hintTimer = window.setTimeout(() => {
      if (hintEl.dataset.state === "out") hintEl.hidden = true;
    }, HINT_OUT_MS);
  }
}

/* ---------- the one beam: a rep was counted (docs/design/spec.md §4 item 1) ---------- */

let pulseTimer: number | undefined;

function clearPulse() {
  window.clearTimeout(pulseTimer);
  stage.removeEventListener("animationend", onPulseEnd);
  delete stage.dataset.rep;
}

function onPulseEnd(e: AnimationEvent) {
  if (e.target === stage && e.animationName === "rep-pulse") clearPulse();
}

function pulseRep() {
  clearPulse();
  void stage.offsetWidth; // a CSS animation only restarts once the attribute has actually been off
  stage.dataset.rep = "counted";
  if (reduceMotion.matches) {
    // No animation under reduced motion: a static accent frame, held for 600 ms, then simply gone.
    pulseTimer = window.setTimeout(clearPulse, 600);
    return;
  }
  // AnimationEvent bubbles: the verdict word's 120 ms `verdict-in` ends on a descendant of #stage and
  // would cut the 180 ms pulse short (reviewer, 2026-09-21). Only this element's own pulse may end it.
  stage.addEventListener("animationend", onPulseEnd);
  pulseTimer = window.setTimeout(clearPulse, PULSE_FALLBACK_MS);
}

/* ---------- the count (top left) ---------- */

let goodShown = -1;
/** Instant, never tweened: a count-up would lie about when the rep landed. */
function setGood(n: number) {
  if (n === goodShown) return;
  goodShown = n;
  goodEl.textContent = String(n);
}

/* ---------- session ---------- */

function resetHud() {
  goodShown = -1;
  attemptsShown = -1;
  setGood(0);
  setAttempts(0);
  fpsEl.textContent = IDLE;
  verdictShown = IDLE;
  verdictBox.dataset.tone = "neutral";
  formEl.textContent = IDLE;
  hintShown = null;
  hintEl.hidden = true;
  delete stage.dataset.rep;
}

let attemptsShown = -1;
function setAttempts(n: number) {
  if (n === attemptsShown) return;
  attemptsShown = n;
  totalEl.textContent = String(n);
  attemptsWord.textContent = n === 1 ? "attempt" : "attempts";
}

function idleHud() {
  fpsEl.textContent = IDLE;
  setVerdict(IDLE, "neutral");
  setHint(null);
}

async function start(mode: Mode) {
  if (session || starting) return;
  starting = true;
  setButtons(false);
  resetHud();
  slowSince = null;
  slowWarned = false;
  stage.classList.add("live");
  // On a phone the header and buttons push the stage below the fold; bring the whole stage into view.
  if (window.innerWidth <= 480) stage.scrollIntoView({ block: "start", behavior: reduceMotion.matches ? "auto" : "smooth" });
  try {
    const { startSession } = await import("./session");
    session = await startSession({
      mode,
      video,
      canvas,
      onStatus: setStatus,
      onRep: (ev) => {
        setGood(ev.goodReps);
        setAttempts(ev.totalReps);
        // The accent means one thing on this page: a rep was counted.
        if (ev.good) pulseRep();
        capture("rep_counted", { good: ev.good, reason: ev.reason });
      },
      onFrame: (st, verdict, fps, hint, paused, result) => {
        setGood(st.goodReps);
        setAttempts(st.totalReps);
        const [text, tone] = verdictWords(paused, verdict, result);
        setVerdict(text, tone);
        setHint(hint);
        fpsEl.textContent = fps ? `${fps} fps` : IDLE;
        if (fps && fps < SLOW_FPS) {
          slowSince ??= performance.now();
          if (!slowWarned && performance.now() - slowSince >= SLOW_MS) {
            slowWarned = true;
            setStatus(`Slow device (${fps} fps): fast reps may be missed. Close other tabs or use a laptop.`);
          }
        } else slowSince = null;
      },
      onEnd: () => {
        const result = `${goodEl.textContent} good of ${totalEl.textContent}`;
        session = null;
        setButtons(false);
        idleHud();
        setStatus(`Clip finished: ${result}. Play it again or start your camera.`);
      },
      onError: (err) => {
        session = null;
        stage.classList.remove("live");
        idleHud();
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
  idleHud();
});

if (!navigator.mediaDevices?.getUserMedia) {
  startBtn.disabled = true;
  setStatus("This browser has no camera API; the demo clip still works.");
}

bootAnalytics();
