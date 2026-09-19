/**
 * The 24 inputs of the form classifier v2 (scripts/train_form_model.py, same maths): the 12 landmarks'
 * x, y in square units (x times the frame aspect), centred on the hip midpoint, divided by the torso
 * length, and mirrored (x negated, left/right swapped) so the feet are always on the left. Scale-, shift-
 * and orientation-invariant; no z (see the trainer for why).
 */
export function formFeatures(vector: readonly number[], aspect: number): number[] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 12; i++) pts.push([vector[i * 3] * aspect, vector[i * 3 + 1]]);
  const shoulder = mid(pts[4], pts[5]);
  const hip = mid(pts[6], pts[7]);
  const ankle = mid(pts[10], pts[11]);
  const torso = Math.hypot(shoulder[0] - hip[0], shoulder[1] - hip[1]) || 1e-6;
  const mirror = ankle[0] > shoulder[0];
  const out: number[] = [];
  for (let p = 0; p < 12; p++) {
    // With the mirror, pair (L, R) is read as (R, L).
    const src = mirror ? (p % 2 === 0 ? p + 1 : p - 1) : p;
    const x = ((pts[src][0] - hip[0]) / torso) * (mirror ? -1 : 1);
    const y = (pts[src][1] - hip[1]) / torso;
    out.push(x, y);
  }
  return out;
}

const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
