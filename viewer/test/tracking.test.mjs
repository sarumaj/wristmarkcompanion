// The marker's tracking end to end in Node, on a made-up camera (support/camera.mjs):
// rendered frames with lens blur, motion blur and sensor noise go through detection,
// corner refinement, the pose, the smoothing and the wrist's gestures, as in the viewer.
// - the refined corners are closer to the truth than the detector's;
// - a watch held still stays still: little jitter, no gesture;
// - a quick turn of the wrist is a flick, and so is one that turns the marker out of
//   sight; a slow turn is none.
import "./support/vendor.mjs";
import "./support/aruco.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { multiply, noiseSource, render, rotation } from "./support/camera.mjs";

const { MarkerTracker, focalLength } = await import("../public/js/tracker.js");
const { PoseSmoother } = await import("../public/js/smoothing.js");
const { GestureRecognizer } = await import("../public/js/gestures.js");

const WIDTH = 640;
const HEIGHT = 480;
const FOV = 65;
const SIZE = 20;
const FPS = 30;
const focal = focalLength(WIDTH, FOV);
const DEG = 180 / Math.PI;

// The watch at time t (s): a slight downward look, turned `turn(t)` degrees about the
// vertical, `distance` mm away, with a hand's tremor (a fraction of a degree, a
// millimeter or two).
const watch = (turn, distance = 350) => (t) => ({
  rotation: multiply(rotation([0, 1, 0], turn(t) + 0.6 * Math.sin(t * 50)), rotation([1, 0, 0], 15 + 0.5 * Math.sin(t * 37))),
  translation: [10 + 1.5 * Math.sin(t * 23), -5, distance],
});

// The pipeline over `seconds` of frames, each the average of three moments of its
// exposure (motion blur): the smoothed normals and the gestures.
function run(pose, seconds, { noise = 12, seed = 1 } = {}) {
  const tracker = new MarkerTracker({ markerSize: SIZE, fovDegrees: FOV });
  const smoother = new PoseSmoother();
  const gestures = new GestureRecognizer();
  const random = noiseSource(seed);
  const normals = [];
  const names = [];
  for (let i = 0; i < seconds * FPS; i++) {
    const t = i / FPS;
    const poses = [0, 1, 2].map((k) => pose(t + (k - 1) / (FPS * 6)));
    const image = render({ id: 12, size: SIZE, poses, width: WIDTH, height: HEIGHT, focal, noise, random, samples: 1 });
    const marker = tracker.detect(image)[0];
    const found = marker ? tracker.pose(marker, WIDTH, HEIGHT) : null;
    const now = t * 1000;
    const smoothed = found ? smoother.update(found, now) : smoother.lost(now);
    const frame = found && smoothed ? { t: now, tracked: true, position: smoothed.position.toArray(), quaternion: smoothed.quaternion.toArray() } : { t: now, tracked: false };
    for (const event of gestures.update(frame)) names.push(event.name);
    if (found && smoothed) {
      const q = smoothed.quaternion;
      // The face's normal: the rotation's third column.
      normals.push([2 * (q.x * q.z + q.w * q.y), 2 * (q.y * q.z - q.w * q.x), 1 - 2 * (q.x * q.x + q.y * q.y)]);
    }
  }
  return { normals, names };
}

const angle = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * DEG;

test("the refined corners are closer to where the marker's corners are", () => {
  const tracker = new MarkerTracker({ markerSize: SIZE, fovDegrees: FOV });
  const pose = watch(() => 25, 400)(0);
  const project = ([x, y]) => {
    const p = [0, 1, 2].map((i) => pose.rotation[i][0] * x + pose.rotation[i][1] * y + pose.translation[i]);
    // A pixel's center at its index: half a pixel before the image's coordinate.
    return { x: WIDTH / 2 + (focal * p[0]) / p[2] - 0.5, y: HEIGHT / 2 - (focal * p[1]) / p[2] - 0.5 };
  };
  const truth = [[-10, 10], [10, 10], [10, -10], [-10, -10]].map(project);
  const random = noiseSource(3);
  const error = (corners) =>
    Math.sqrt(corners.reduce((sum, c) => sum + Math.min(...truth.map((t) => (t.x - c.x) ** 2 + (t.y - c.y) ** 2)), 0) / 4);
  let raw = 0;
  let refined = 0;
  for (let i = 0; i < 6; i++) {
    const image = render({ id: 12, size: SIZE, poses: [pose], width: WIDTH, height: HEIGHT, focal, noise: 5, random, samples: 2 });
    raw += error(tracker.detect(image, { refine: false })[0].corners);
    refined += error(tracker.detect(image)[0].corners);
  }
  assert.ok(refined < raw / 2 && refined / 6 < 0.4, `refined ${(refined / 6).toFixed(2)} px, the detector's ${(raw / 6).toFixed(2)} px`);
});

test("a watch held still stays still, and makes no gesture", () => {
  // Before the refinement and the One Euro filter: 6.8° between frames (rms), jumps of
  // up to 26° (the flip), and a flick.
  const { normals, names } = run(watch(() => 20), 2);
  assert.ok(normals.length >= 55, `tracked in ${normals.length} frames`);
  const settled = normals.slice(10);
  const steps = settled.slice(1).map((n, i) => angle(settled[i], n));
  const largest = Math.max(...steps);
  const rms = Math.sqrt(steps.reduce((sum, s) => sum + s * s, 0) / steps.length);
  assert.ok(rms < 1 && largest < 3, `the face moved ${rms.toFixed(2)}° between frames (rms), up to ${largest.toFixed(2)}°`);
  assert.deepEqual(names, []);
});

test("a quick turn of the wrist is a flick; a slow one is none", () => {
  const quick = run(watch((t) => (t < 0.6 ? 0 : Math.min(45, (t - 0.6) * 300)), 450), 1.4, { seed: 2 });
  assert.ok(quick.names.includes("flick"), `recognized: ${quick.names.join() || "nothing"}`);
  // Before: a flick.
  const slow = run(watch((t) => Math.min(45, t * 30)), 1.6, { seed: 3 });
  assert.ok(!slow.names.includes("flick"), `recognized: ${slow.names.join()}`);
});

test("a flick that turns the marker out of sight is one too", () => {
  const away = run(watch((t) => (t < 0.6 ? 0 : (t - 0.6) * 500)), 1.2);
  assert.ok(away.names.includes("flick"), `recognized: ${away.names.join() || "nothing"}`);
});
