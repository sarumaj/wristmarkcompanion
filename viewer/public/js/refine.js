// The marker's corners to a fraction of a pixel. js-aruco2 finds them on the outline of
// its thresholded image, to the nearest pixel, and the pose's angles follow every pixel
// they jump (docs/dev/decisions/003-pose.md#stability). Here each of the four edges is
// found again in the grey image: across the edge, at points along it, where the
// brightness rises fastest from the black border to the white quiet zone (to a fraction
// of a pixel by a parabola through the three samples around the peak); a straight line
// fitted through those points; and the corners where neighbouring lines meet.

// Points looked for along each edge, at most, and the share of its ends left out (the
// corners, where the other edge's step mixes in).
const POINTS = 24;
const END = 0.12;
// How far across the edge the step is looked for, in pixels: a share of the edge's
// length, within bounds.
const REACH = 0.08;
const REACH_MIN = 1.5;
const REACH_MAX = 6;
const STEP = 0.5;
// A step weaker than this (grey levels per pixel) is no edge.
const MIN_GRADIENT = 8;
// A point farther than this from the first line fitted (pixels) is left out of the second.
const OUTLIER = 1;
// A refined corner farther than this from the detector's (a share of the edge's length)
// means something went wrong: the detector's is kept.
const MAX_MOVE = 0.15;

// Bilinear grey level at (x, y) of a single-channel image {width, height, data}.
function sample(image, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= image.width || y0 + 1 >= image.height) return NaN;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * image.width + x0;
  const d = image.data;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + image.width] * (1 - fx) + d[i + image.width + 1] * fx) * fy;
}

// Total least squares: the line {point, direction} closest to the points, or null.
function fitLine(points) {
  if (points.length < 4) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { x: mx, y: my, dx: Math.cos(angle), dy: Math.sin(angle) };
}

const offLine = (line, p) => Math.abs((p.x - line.x) * line.dy - (p.y - line.y) * line.dx);

function intersect(a, b) {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-6) return null;
  const s = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
  return { x: a.x + s * a.dx, y: a.y + s * a.dy };
}

// The edge from corner a to corner b found again: its line, or null.
function edgeLine(image, a, b, center) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 8) return null;
  const tx = (b.x - a.x) / length;
  const ty = (b.y - a.y) / length;
  // The normal pointing out of the marker, away from its center.
  let nx = -ty;
  let ny = tx;
  if (((a.x + b.x) / 2 - center.x) * nx + ((a.y + b.y) / 2 - center.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const reach = Math.min(REACH_MAX, Math.max(REACH_MIN, REACH * length));
  const count = Math.min(POINTS, Math.max(6, Math.floor(length / 2)));
  const points = [];
  for (let k = 0; k < count; k++) {
    const s = END + ((1 - 2 * END) * k) / (count - 1);
    const px = a.x + s * (b.x - a.x);
    const py = a.y + s * (b.y - a.y);
    // The brightness across the edge, and where it rises fastest outward.
    const profile = [];
    for (let d = -reach - STEP; d <= reach + STEP + 1e-9; d += STEP) profile.push(sample(image, px + d * nx, py + d * ny));
    let best = -1;
    let bestGradient = MIN_GRADIENT * 2 * STEP;
    for (let i = 1; i < profile.length - 1; i++) {
      const gradient = profile[i + 1] - profile[i - 1];
      if (gradient > bestGradient) {
        bestGradient = gradient;
        best = i;
      }
    }
    if (best < 2 || best > profile.length - 3) continue;
    const g0 = profile[best] - profile[best - 2];
    const g2 = profile[best + 2] - profile[best];
    const curvature = g0 - 2 * bestGradient + g2;
    const shift = curvature < 0 ? (0.5 * (g0 - g2)) / curvature : 0;
    const d = -reach - STEP + (best + Math.max(-0.5, Math.min(0.5, shift))) * STEP;
    points.push({ x: px + d * nx, y: py + d * ny });
  }
  const first = fitLine(points);
  if (!first) return null;
  return fitLine(points.filter((p) => offLine(first, p) <= OUTLIER));
}

// The corners ([{x, y}] × 4, in order around the marker) refined in `grey` (a
// single-channel image: js-aruco2's detector.grey); each corner the refinement can't
// find stays as it was.
export function refineCorners(grey, corners) {
  const center = {
    x: corners.reduce((sum, c) => sum + c.x, 0) / 4,
    y: corners.reduce((sum, c) => sum + c.y, 0) / 4,
  };
  const lines = corners.map((corner, i) => edgeLine(grey, corner, corners[(i + 1) % 4], center));
  return corners.map((corner, i) => {
    const before = lines[(i + 3) % 4];
    const after = lines[i];
    const point = before && after ? intersect(before, after) : null;
    const side = Math.min(
      Math.hypot(corners[(i + 1) % 4].x - corner.x, corners[(i + 1) % 4].y - corner.y),
      Math.hypot(corners[(i + 3) % 4].x - corner.x, corners[(i + 3) % 4].y - corner.y),
    );
    if (!point || Math.hypot(point.x - corner.x, point.y - corner.y) > MAX_MOVE * side) return corner;
    return point;
  });
}
