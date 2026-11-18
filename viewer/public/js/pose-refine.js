// A marker's pose made to fit its corners as closely as they allow. POSIT (js-aruco2's
// posit1.js) gives the planar marker's two poses approximately; a few Gauss-Newton steps
// then minimize the distance, in pixels, between the corners seen and those the pose
// projects (docs/dev/decisions/003-pose.md#stability). Plain arrays: rotation as 3×3 rows,
// translation [x, y, z], POSIT's frame (x right, y up, z away from the camera); image
// points around the image's center, y up, as POSIT takes them.

const ITERATIONS = 6;
const DELTA = 1e-6;

// The marker's corners on its own face, in the detector's order (from its top left,
// clockwise as seen), for a side of `size`.
export function modelCorners(size) {
  const h = size / 2;
  return [[-h, h], [h, h], [h, -h], [-h, -h]];
}

// Rotation matrix of the axis-angle vector w (radians), Rodrigues' formula.
function exp([x, y, z]) {
  const a = Math.hypot(x, y, z);
  if (a < 1e-12) return [[1, -z, y], [z, 1, -x], [-y, x, 1]];
  const [u, v, w] = [x / a, y / a, z / a];
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = 1 - c;
  return [
    [c + u * u * k, u * v * k - w * s, u * w * k + v * s],
    [v * u * k + w * s, c + v * v * k, v * w * k - u * s],
    [w * u * k - v * s, w * v * k + u * s, c + w * w * k],
  ];
}

const times = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

// The corners' projections: [x0, y0, x1, y1, ...].
function project(rotation, translation, model, focal) {
  const out = [];
  for (const [X, Y] of model) {
    const x = rotation[0][0] * X + rotation[0][1] * Y + translation[0];
    const y = rotation[1][0] * X + rotation[1][1] * Y + translation[1];
    const z = rotation[2][0] * X + rotation[2][1] * Y + translation[2];
    out.push((focal * x) / z, (focal * y) / z);
  }
  return out;
}

function residuals(rotation, translation, model, focal, points) {
  const projected = project(rotation, translation, model, focal);
  return points.flatMap((p, i) => [projected[2 * i] - p.x, projected[2 * i + 1] - p.y]);
}

const rms = (r) => Math.sqrt(r.reduce((sum, v) => sum + v * v, 0) / (r.length / 2));

// Solves the 6×6 system a·x = b (Gaussian elimination with pivoting), or null.
function solve(a, b) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = m[row][col] / m[col][col];
      for (let k = col; k <= n; k++) m[row][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

// The pose {rotation, translation} refined against `points` (the corners, around the
// image's center, y up) for a marker of `size` seen with `focal`; with `error`, the
// root mean square distance in pixels. A step that doesn't improve the fit stops it.
export function refinePose({ rotation, translation }, points, size, focal) {
  const model = modelCorners(size);
  let r = rotation;
  let t = translation;
  let current = residuals(r, t, model, focal, points);
  let error = rms(current);
  let damping = 1e-3;
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    // The Jacobian by differences: three small rotations (applied on the left) and
    // three translations, the latter in proportion to the distance.
    const columns = [];
    for (let k = 0; k < 6; k++) {
      const step = k < 3 ? DELTA * 100 : DELTA * 100 * Math.abs(t[2]);
      const w = [0, 0, 0];
      const dt = [0, 0, 0];
      if (k < 3) w[k] = step;
      else dt[k - 3] = step;
      const moved = residuals(times(exp(w), r), t.map((v, i) => v + dt[i]), model, focal, points);
      columns.push(moved.map((v, i) => (v - current[i]) / step));
    }
    const jtj = columns.map((a) => columns.map((b) => a.reduce((sum, v, i) => sum + v * b[i], 0)));
    const jtr = columns.map((a) => a.reduce((sum, v, i) => sum + v * current[i], 0));
    for (let k = 0; k < 6; k++) jtj[k][k] *= 1 + damping;
    const x = solve(jtj, jtr.map((v) => -v));
    if (!x) break;
    const nextR = times(exp(x.slice(0, 3)), r);
    const nextT = t.map((v, i) => v + x[3 + i]);
    const next = residuals(nextR, nextT, model, focal, points);
    const nextError = rms(next);
    if (!(nextError < error) || !(nextT[2] > 0)) {
      damping *= 10;
      if (damping > 1e3) break;
      continue;
    }
    const gain = error - nextError;
    [r, t, current, error] = [nextR, nextT, next, nextError];
    damping = Math.max(1e-6, damping / 10);
    if (gain < 1e-4) break;
  }
  return { rotation: r, translation: t, error };
}
