// The guided device test's measurements (docs/dev/device-tests.md), from the frames of a
// capture: plain numbers in, plain numbers out, so that they run in Node's tests too.
//
// A frame: {t (ms), found, detectMs, distance (mm, the smoothed pose's, or null),
// position [x, y, z] (mm), normal [x, y, z] (the marker's face, unit length, in the
// camera's frame), tilt (degrees between the face and the line of sight),
// brightness (0-255, the marker's mean gray, or null)}.

// Between two frames, a turn of the face by more than this is a flip, not motion:
// the planar marker's two poses are mirrored about the line of sight.
export const FLIP_DEGREES = 25;
// The verdict's limits: what a person sees as a model sitting still on the watch.
export const STEADY_MM = 1.5;
export const STEADY_DEGREES = 2;

const degrees = (radians) => (radians * 180) / Math.PI;

export function median(values) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function angleBetween(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return degrees(Math.acos(Math.min(1, Math.max(-1, dot))));
}

// The root mean square of the distances of points from their mean.
function spread(points) {
  if (points.length < 2) {
    return 0;
  }
  const center = [0, 1, 2].map((axis) => mean(points.map((point) => point[axis])));
  return Math.sqrt(mean(points.map((point) => point.reduce((sum, value, axis) => sum + (value - center[axis]) ** 2, 0))));
}

// The longest stretch without the marker, in ms, the capture's ends included.
function longestGap(frames, start, end) {
  let gap = 0;
  let last = start;
  for (const frame of frames) {
    if (frame.found) {
      gap = Math.max(gap, frame.t - last);
      last = frame.t;
    }
  }
  return Math.max(gap, end - last);
}

// A capture's numbers: frames from `start` to `end` (ms).
export function summarize(frames, start = frames[0]?.t ?? 0, end = frames.at(-1)?.t ?? start) {
  const seconds = Math.max(end - start, 1) / 1000;
  const found = frames.filter((frame) => frame.found && frame.normal);
  const normals = found.map((frame) => frame.normal);
  const meanNormal = (() => {
    const sum = [0, 1, 2].map((axis) => normals.reduce((total, normal) => total + normal[axis], 0));
    const length = Math.hypot(...sum);
    return length ? sum.map((value) => value / length) : null;
  })();
  let flips = 0;
  for (let i = 1; i < found.length; i++) {
    if (angleBetween(found[i - 1].normal, found[i].normal) > FLIP_DEGREES) {
      flips++;
    }
  }
  const brightness = found.map((frame) => frame.brightness).filter((value) => value !== null && value !== undefined);
  return {
    seconds,
    frames: frames.length,
    fps: frames.length / seconds,
    rate: frames.length ? frames.filter((frame) => frame.found).length / frames.length : 0,
    detectMs: mean(frames.map((frame) => frame.detectMs)) ?? 0,
    distance: median(found.map((frame) => frame.distance).filter((value) => value !== null)),
    tilt: median(found.map((frame) => frame.tilt)),
    jitterMm: spread(found.map((frame) => frame.position)),
    jitterDegrees: meanNormal ? Math.sqrt(mean(normals.map((normal) => angleBetween(normal, meanNormal) ** 2))) : 0,
    flips,
    longestGapMs: longestGap(frames, start, end),
    brightness: median(brightness),
  };
}

// What the protocol's "Steady" column would say: lost, flips, jitters or yes.
export function verdict(summary) {
  if (summary.rate < 0.5) {
    return "lost";
  }
  if (summary.flips > 0) {
    return "flips";
  }
  if (summary.jitterMm > STEADY_MM || summary.jitterDegrees > STEADY_DEGREES) {
    return "jitters";
  }
  return "yes";
}

// A session-length run's times, in seconds from the marker's first appearance (the
// app opened, or the button pressed, as the run starts): when the display dimmed
// (the marker's brightness below `dimRatio` of its first seconds', for a second) and
// when it went off (the marker unseen for `offMs`, timed from its last sighting). Also
// the detection rate while dimmed, before off.
export function sessionTimes(frames, { dimRatio = 0.75, offMs = 5000, baselineMs = 3000 } = {}) {
  const first = frames.find((frame) => frame.found);
  if (!first) {
    return { baseline: null, dimsAfter: null, offAfter: null, rateWhileDimmed: null };
  }
  const start = first.t;
  const seen = frames.filter((frame) => frame.found && frame.brightness !== null && frame.brightness !== undefined);
  const baseline = median(seen.filter((frame) => frame.t - start <= baselineMs).map((frame) => frame.brightness));
  let dims = null;
  if (baseline) {
    let below = null;
    for (const frame of seen) {
      if (frame.brightness < baseline * dimRatio) {
        below ??= frame.t;
        if (frame.t - below >= 1000) {
          dims = below;
          break;
        }
      } else {
        below = null;
      }
    }
  }
  let off = null;
  let last = start;
  for (const frame of frames) {
    if (frame.t < start || !frame.found) {
      continue;
    }
    if (frame.t - last >= offMs) {
      off = last;
      break;
    }
    last = frame.t;
  }
  const end = frames.at(-1).t;
  if (off === null && end - last >= offMs) {
    off = last;
  }
  const dimmed = dims === null ? [] : frames.filter((frame) => frame.t >= dims && (off === null || frame.t < off));
  return {
    baseline,
    dimsAfter: dims === null ? null : (dims - start) / 1000,
    offAfter: off === null ? null : (off - start) / 1000,
    rateWhileDimmed: dimmed.length ? dimmed.filter((frame) => frame.found).length / dimmed.length : null,
  };
}

// The farthest measured distance (cm) with at least `minimum` detection, per light.
export function farthest(rangeResults, minimum = 0.9) {
  const best = {};
  for (const result of rangeResults) {
    const key = `${result.lighting}${result.night ? ", red light" : ""}`;
    if (result.summary.rate >= minimum) {
      best[key] = Math.max(best[key] ?? 0, result.distanceCm);
    } else {
      best[key] ??= null;
    }
  }
  return best;
}

// The marker's brightness in an ImageData ({width, height, data}): the mean of each
// pixel's brightest channel (the watch's red light counts as light) over the inner
// part of the corners' bounding box, every third pixel.
export function markerBrightness(image, corners) {
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const insetX = (right - left) * 0.15;
  const insetY = (bottom - top) * 0.15;
  const x0 = Math.max(0, Math.floor(left + insetX));
  const x1 = Math.min(image.width - 1, Math.ceil(right - insetX));
  const y0 = Math.max(0, Math.floor(top + insetY));
  const y1 = Math.min(image.height - 1, Math.ceil(bottom - insetY));
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += 3) {
    for (let x = x0; x <= x1; x += 3) {
      const i = (y * image.width + x) * 4;
      sum += Math.max(image.data[i], image.data[i + 1], image.data[i + 2]);
      count++;
    }
  }
  return count ? sum / count : null;
}
