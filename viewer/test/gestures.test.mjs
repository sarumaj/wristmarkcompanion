// The wrist's gestures (public/js/gestures.js) on made-up movements of the watch, at
// 30 frames a second: each gesture is recognized, and hand shake, slow turns and the
// pose's planar flip are not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GestureRecognizer, rotate } from "../public/js/gestures.js";

const RAD = Math.PI / 180;
const quaternion = ([x, y, z], degrees) => {
  const half = (degrees * RAD) / 2;
  const s = Math.sin(half);
  return [x * s, y * s, z * s, Math.cos(half)];
};
// The product a·b of two quaternions [x, y, z, w].
const multiply = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];

// Frames from `pose(t in seconds)` → {position, quaternion}, for `seconds`; the names
// of the gestures recognized.
function run(pose, seconds, recognizer = new GestureRecognizer()) {
  const names = [];
  for (let i = 0; i <= seconds * 30; i++) {
    const t = (i * 1000) / 30;
    for (const event of recognizer.update({ t, tracked: true, ...pose(t / 1000) })) names.push(event.name);
  }
  return names;
}

// A watch 300 mm away, facing the camera, with a little noise: a hand holding still.
const noise = (t, seed) => Math.sin(t * 37 + seed) * 0.3;
const still = (t) => ({
  position: [noise(t, 1), noise(t, 2), -300 + noise(t, 3)],
  quaternion: multiply(quaternion([1, 0, 0], noise(t, 4)), quaternion([0, 1, 0], noise(t, 5))),
});

test("rotate turns a vector by a quaternion", () => {
  const [x, y, z] = rotate(quaternion([0, 0, 1], 90), [1, 0, 0]);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(y - 1) < 1e-9 && Math.abs(z) < 1e-9);
});

test("a hand holding still makes no gesture", () => {
  assert.deepEqual(run(still, 3), []);
});

test("a flick: the watch turned 40 degrees in an eighth of a second", () => {
  const names = run((t) => ({ ...still(t), quaternion: quaternion([1, 0, 0], t < 1 ? 0 : Math.min(40, (t - 1) * 320)) }), 2);
  assert.ok(names.includes("flick"), names.join());
});

test("a twist about the watch's own axis, either way; a slow turn isn't one", () => {
  const twisted = (degrees, over) => (t) => ({ ...still(t), quaternion: quaternion([0, 0, 1], t < 1 ? 0 : Math.min(degrees, ((t - 1) / over) * degrees)) });
  assert.ok(run(twisted(60, 0.3), 2).includes("twist"));
  const recognizer = new GestureRecognizer();
  run(twisted(-60, 0.3), 2, recognizer);
  assert.ok(recognizer.roll < -50, `the roll follows: ${recognizer.roll}`);
  assert.ok(!run(twisted(60, 3), 5).includes("twist"));
});

test("a shake: three quick sideways reversals", () => {
  const names = run((t) => ({ ...still(t), position: [t < 1 ? 0 : 15 * Math.sin((t - 1) * Math.PI * 2 * 3), 0, -300] }), 2.2);
  assert.ok(names.includes("shake"), names.join());
});

test("a hold: still for a moment after moving, once", () => {
  const names = run((t) => ({ ...still(t), position: [t < 1 ? t * 100 : 100, 0, -300] }), 3);
  assert.deepEqual(names.filter((name) => name === "hold"), ["hold"]);
});

test("the planar flip, a jump in one frame, is no flick", () => {
  const names = run((t) => ({ ...still(t), quaternion: quaternion([1, 0, 0], t < 1 ? 20 : -20) }), 2);
  assert.ok(!names.includes("flick"), names.join());
});
