// The hand in front of the model (public/js/occlusion.js) and the model kept while a hand
// hides the marker (public/js/smoothing.js): a made-up hand projected through a known camera
// is put back where it was; a hand over the marker's place is told from one beside it; a
// pose held under a hand glides to the marker found again instead of jumping.
import "./support/vendor.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { MARGIN_MM, handOver, placeHand } = await import("../public/js/occlusion.js");
const { PoseSmoother } = await import("../public/js/smoothing.js");

const CAMERA = { width: 1280, height: 720, fovDegrees: 65 };

// 21 points about a hand's center (meters, the image's axes: x right, y down, z away),
// spread like a hand's, tilted so that some are nearer the camera than others.
function hand() {
  return Array.from({ length: 21 }, (_, i) => ({
    x: 0.04 * Math.cos(i * 1.3) + 0.002 * i,
    y: 0.05 * Math.sin(i * 0.7) - 0.002 * i,
    z: 0.015 * Math.sin(i * 2.1),
  }));
}

// The image points (0 to 1) of `world` with its center at `offset` (mm) from the camera.
function project(world, offset, { width, height, fovDegrees }) {
  const f = (0.5 * width) / Math.tan((fovDegrees * Math.PI) / 360);
  return world.map(({ x, y, z }) => {
    const [px, py, pz] = [x * 1000 + offset[0], y * 1000 + offset[1], z * 1000 + offset[2]];
    return { x: 0.5 + (f * px) / pz / width, y: 0.5 + (f * py) / pz / height };
  });
}

test("a hand seen by the camera is put where it is, a margin farther", () => {
  const world = hand();
  const offset = [40, -25, 320];
  const placed = placeHand(project(world, offset, CAMERA), world, CAMERA);
  assert.ok(placed, "placed");
  for (let i = 0; i < world.length; i++) {
    // The truth in three.js's camera frame: y up, z toward the viewer.
    const truth = [world[i].x * 1000 + offset[0], -(world[i].y * 1000 + offset[1]), -(world[i].z * 1000 + offset[2])];
    const length = Math.hypot(...truth);
    const expected = truth.map((value) => (value * (length + MARGIN_MM)) / length);
    const error = Math.hypot(...expected.map((value, axis) => value - placed[i].getComponent(axis)));
    assert.ok(error < 0.5, `point ${i} is ${error.toFixed(2)} mm off`);
  }
});

test("a hand over the marker's place hides it, one beside it doesn't", () => {
  // A marker 100 pixels wide in a 640 by 480 frame, at its center.
  const corners = [{ x: 270, y: 190 }, { x: 370, y: 190 }, { x: 370, y: 290 }, { x: 270, y: 290 }];
  const at = (x, y) => Array.from({ length: 21 }, () => ({ x: x / 640, y: y / 480 }));
  assert.equal(handOver([at(320, 240)], corners, 640, 480), true);
  // Within half the marker's width of its box.
  assert.equal(handOver([at(410, 240)], corners, 640, 480), true);
  assert.equal(handOver([at(500, 240)], corners, 640, 480), false);
  assert.equal(handOver([], corners, 640, 480), false);
  assert.equal(handOver([at(320, 240)], null, 640, 480), false);
});

// A pose as MarkerTracker.pose gives it: facing the camera, `x` mm right, 300 mm away.
const facing = (x) => ({
  best: { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [x, 0, 300], error: 0.5 },
  alternative: null,
});

test("a pose held under a hand stays, and glides to the marker found again", () => {
  const smoother = new PoseSmoother();
  for (let t = 0; t <= 300; t += 33) smoother.update(facing(0), t);
  // Two seconds hidden: kept with a hand's hold, gone with the smoother's own.
  assert.ok(smoother.lost(2300, 4000), "held under the hand");
  const other = new PoseSmoother();
  for (let t = 0; t <= 300; t += 33) other.update(facing(0), t);
  assert.equal(other.lost(2300), null, "gone without the hand");
  // Found again 50 mm to the right: part of the way at once, all of it within the glide.
  const first = smoother.update(facing(50), 2333).position.x;
  assert.ok(first > 5 && first < 30, `the first frame back at ${first.toFixed(1)} mm`);
  let x = first;
  for (let t = 2366; t <= 2333 + 600; t += 33) x = smoother.update(facing(50), t).position.x;
  assert.ok(Math.abs(x - 50) < 1, `there at ${x.toFixed(1)} mm`);
});
