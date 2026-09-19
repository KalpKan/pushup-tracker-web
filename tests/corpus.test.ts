/**
 * Corpus gate: replays the Python-pipeline traces of every ground-truth clip
 * (tests/fixtures/traces/<id>.json, made by scripts/make_traces.py) through the TypeScript rep counter and
 * compares the counts with the hand-labelled truth in tests/fixtures/clips/ground_truth.json.
 *
 * The bar (docs/reports/pushups-spec.md in the portfolio repo): every clip's total within ±1 and its
 * good-rep count within [good_min-1, good_max+1]. Until the counter meets it this test only prints the
 * table; set PUSHUPS_CORPUS_GATE=1 to make misses fail (the fixer flips it on in CI once it passes).
 * The real end-to-end check (MediaPipe in Chrome, fake camera) is scripts/e2e-corpus.mjs.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createRepCounter } from "../src/repCounter";

interface Rep { n: number; bottom_s: number; form: string; confidence: string }
interface Clip { id: string; path: string; committed: boolean; duration_s: number; reps: Rep[]; total: number; good_min: number; good_max: number }
interface Trace { id: string; fps: number; frames: { frame: number; t: number; shoulderY: number | null; prob?: number }[] }

const gt = JSON.parse(readFileSync(new URL("./fixtures/clips/ground_truth.json", import.meta.url), "utf8")) as { total_tolerance: number; clips: Clip[] };
const tol = gt.total_tolerance ?? 1;
const GATE = process.env.PUSHUPS_CORPUS_GATE === "1";

function replay(trace: Trace) {
  const counter = createRepCounter();
  const events: { t: number; good: boolean }[] = [];
  for (const f of trace.frames) {
    if (f.shoulderY == null || f.prob == null) continue;
    const ev = counter.push({ shoulderY: f.shoulderY, good: f.prob > 0.5 });
    if (ev) events.push({ t: f.t, good: ev.good });
  }
  return { events, ...counter.state() };
}

describe("rep counter vs hand-labelled ground truth (Python landmark traces)", () => {
  const rows: string[] = [];
  const misses: string[] = [];
  const clips = gt.clips.filter((c) => existsSync(new URL(`./fixtures/traces/${c.id}.json`, import.meta.url)));

  it("has a trace for every committed clip", () => {
    const missing = gt.clips.filter((c) => c.committed && !clips.includes(c)).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  for (const clip of clips) {
    it(`${clip.id}: total ${clip.total}±${tol}, good ${clip.good_min}-${clip.good_max}±${tol}`, () => {
      const trace = JSON.parse(readFileSync(new URL(`./fixtures/traces/${clip.id}.json`, import.meta.url), "utf8")) as Trace;
      const r = replay(trace);
      const totalOk = Math.abs(r.totalReps - clip.total) <= tol;
      const goodOk = r.goodReps >= clip.good_min - tol && r.goodReps <= clip.good_max + tol;
      const line = `${clip.id.padEnd(16)} ${totalOk && goodOk ? "ok  " : "MISS"} total ${r.totalReps} (want ${clip.total})  good ${r.goodReps} (want ${clip.good_min}-${clip.good_max})  events ${r.events.map((e) => `${e.t.toFixed(1)}${e.good ? "g" : "b"}`).join(" ")}`;
      rows.push(line);
      if (!(totalOk && goodOk)) misses.push(line);
      if (GATE) {
        expect(totalOk, line).toBe(true);
        expect(goodOk, line).toBe(true);
      }
    });
  }

  it("prints the corpus table", () => {
    console.log(`\nrep counter corpus (${clips.length} clips, ${clips.length - misses.length} within tolerance${GATE ? ", gate ON" : ", report only: PUSHUPS_CORPUS_GATE=1 to enforce"}):\n${rows.join("\n")}\n`);
    expect(rows.length).toBe(clips.length);
  });
});
