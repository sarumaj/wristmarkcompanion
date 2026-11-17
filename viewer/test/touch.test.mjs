// The turn by hand (public/js/touch.js): it follows the pointer's angle around the
// watch's center, coasts on after release and slows down, and ignores the center.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Turntable } from "../public/js/touch.js";

const DEG = 180 / Math.PI;

// A drag along a circle of `radius` around (100, 100), from `from` to `to` degrees
// (counterclockwise on screen, where y grows downward), in `steps` of 16 ms.
function circle(turntable, radius, from, to, steps = 20) {
  const at = (degrees) => [100 + radius * Math.cos(degrees / DEG), 100 - radius * Math.sin(degrees / DEG)];
  let [x, y] = at(from);
  for (let i = 1; i <= steps; i++) {
    const [nx, ny] = at(from + ((to - from) * i) / steps);
    turntable.drag(nx, ny, nx - x, ny - y, 100, 100, i * 16);
    [x, y] = [nx, ny];
  }
}

test("a drag around the center turns as much as the pointer went round", () => {
  const turntable = new Turntable();
  circle(turntable, 80, 0, 90);
  assert.ok(Math.abs(turntable.angle * DEG - 90) < 0.01, turntable.angle * DEG);
  circle(turntable, 80, 90, -30);
  assert.ok(Math.abs(turntable.angle * DEG + 30) < 0.01, turntable.angle * DEG);
});

test("after release it coasts on in the same direction, and stops", () => {
  const turntable = new Turntable();
  circle(turntable, 80, 0, 60);
  turntable.release();
  const released = turntable.angle;
  turntable.step(16);
  assert.ok(turntable.angle > released);
  for (let i = 0; i < 400; i++) turntable.step(16);
  const settled = turntable.angle;
  turntable.step(16);
  assert.equal(turntable.angle, settled);
  assert.ok(settled * DEG < 60 + 120, `coasted to ${settled * DEG}°`);
});

test("a drag across the center doesn't spin it wildly; turn and reset", () => {
  const turntable = new Turntable();
  turntable.drag(103, 100, 6, 0, 100, 100, 16);
  assert.equal(turntable.angle, 0);
  turntable.turn(Math.PI / 12);
  assert.ok(Math.abs(turntable.angle * DEG - 15) < 1e-9);
  turntable.reset();
  assert.equal(turntable.angle, 0);
});
