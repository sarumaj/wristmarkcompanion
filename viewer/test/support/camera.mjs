// A made-up camera: the watch's marker rendered at a known pose into an RGBA image, as
// the viewer's detection gets it, with the blur of a lens and of motion and a sensor's
// noise. The pose is POSIT's frame (x right, y up, z away from the camera, millimeters);
// the watch shows the marker in its white quiet zone on a black display
// (watch/source/MarkerView.mc), on a wrist of skin's grey.
import { markerCells, MARKER_CELLS } from "../../public/js/markers.js";

const SKIN = 150;
const DISPLAY = 25;
const WHITE = 235;
const BLACK = 20;

// A deterministic generator of normal noise (Box–Muller over a linear congruential one).
export function noiseSource(seed = 1) {
  let state = seed >>> 0;
  const uniform = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

// A rotation matrix (rows) from axis-angle, degrees.
export function rotation([x, y, z], degrees) {
  const n = Math.hypot(x, y, z);
  [x, y, z] = [x / n, y / n, z / n];
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = 1 - c;
  return [
    [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
    [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
    [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
  ];
}

export function multiply(a, b) {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}

// The grey level the watch shows at (x, y) on its face (mm from the marker's center, y up).
function face(cells, size, screenRadius, x, y) {
  const cell = size / MARKER_CELLS;
  const half = size / 2;
  if (Math.hypot(x, y) > screenRadius) return SKIN;
  if (Math.abs(x) > half + cell || Math.abs(y) > half + cell) return DISPLAY;
  if (Math.abs(x) >= half || Math.abs(y) >= half) return WHITE;
  const col = Math.min(MARKER_CELLS - 1, Math.floor((x + half) / cell));
  const row = Math.min(MARKER_CELLS - 1, Math.floor((half - y) / cell));
  return cells[row][col] ? WHITE : BLACK;
}

// The image (RGBA, `width` × `height`) of marker `id`, `size` mm across, at each of
// `poses` ({rotation, translation}) averaged (several: motion blur), seen by a camera
// whose focal length is `focal` pixels; `noise` is the sensor's standard deviation in
// grey levels, from `random` (noiseSource).
export function render({ id, size = 20, poses, width = 640, height = 480, focal, noise = 0, random = noiseSource(), screenRatio = 416 / 234, samples = 3 }) {
  const cells = markerCells(id);
  const screenRadius = (size * screenRatio) / 2;
  const grey = new Float32Array(width * height);
  for (const { rotation: r, translation: t } of poses) {
    // The face's normal and the inverse map, pixel → face, for this pose.
    const n = [r[0][2], r[1][2], r[2][2]];
    const nt = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
    for (let v = 0; v < height; v++) {
      for (let u = 0; u < width; u++) {
        let sum = 0;
        for (let sv = 0; sv < samples; sv++) {
          for (let su = 0; su < samples; su++) {
            const dx = (u + (su + 0.5) / samples - width / 2) / focal;
            const dy = -(v + (sv + 0.5) / samples - height / 2) / focal;
            const nd = n[0] * dx + n[1] * dy + n[2];
            const s = nt / nd;
            if (!(s > 0)) {
              sum += SKIN;
              continue;
            }
            const p = [s * dx - t[0], s * dy - t[1], s - t[2]];
            const x = r[0][0] * p[0] + r[1][0] * p[1] + r[2][0] * p[2];
            const y = r[0][1] * p[0] + r[1][1] * p[1] + r[2][1] * p[2];
            sum += face(cells, size, screenRadius, x, y);
          }
        }
        grey[v * width + u] += sum / (samples * samples) / poses.length;
      }
    }
  }
  // A lens's slight blur (a 3×3 binomial kernel), then the sensor's noise.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      let sum = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const x = Math.min(width - 1, Math.max(0, u + i));
          const y = Math.min(height - 1, Math.max(0, v + j));
          sum += grey[y * width + x] * (2 - Math.abs(i)) * (2 - Math.abs(j));
        }
      }
      const value = sum / 16 + noise * random();
      const k = (v * width + u) * 4;
      data[k] = data[k + 1] = data[k + 2] = value;
      data[k + 3] = 255;
    }
  }
  return { width, height, data };
}
