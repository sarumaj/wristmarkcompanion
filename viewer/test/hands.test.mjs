// The other hand's interaction (public/js/hands.js) on made-up hands: 21 landmarks in
// the image's coordinates, as MediaPipe gives them. Pointing onto the model taps it
// once; a pinch closing on it grabs and turns it; the hand wearing the watch is ignored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handPose, HandInteraction } from "../public/js/hands.js";

// A right hand, upright, its wrist at (x, y), the palm 0.1 of the image long: `index`
// and `middle` straight or curled, the thumb's tip apart or on the index's tip.
function hand(x, y, { index = true, middle = true, pinch = false } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  const set = (i, dx, dy) => (points[i] = { x: x + dx, y: y + dy, z: 0 });
  set(5, 0, -0.1); // the index's base
  set(6, 0, -0.14);
  set(8, 0, index ? -0.2 : -0.11);
  set(9, 0.02, -0.1);
  set(10, 0.02, -0.14);
  set(12, 0.02, middle ? -0.2 : -0.11);
  set(4, pinch ? 0.005 : -0.08, pinch ? (index ? -0.2 : -0.11) : -0.08);
  return points;
}

// A model over the square from (0.4, 0.4) to (0.6, 0.6).
const over = (x, y) => x > 0.4 && x < 0.6 && y > 0.4 && y < 0.6;
const watch = { x: 0.5, y: 0.8, radius: 0.04 };

test("the pose: pointing, pinching, an open hand", () => {
  assert.deepEqual(
    [handPose(hand(0, 0, { middle: false })), handPose(hand(0, 0, { pinch: true })), handPose(hand(0, 0))].map(
      ({ pinching, pointing }) => [pinching, pointing],
    ),
    [[false, true], [true, false], [false, false]],
  );
});

test("pointing onto the model taps it once, and again only after leaving it", () => {
  const hands = new HandInteraction();
  const pointing = (x, y) => [hand(x, y + 0.2, { middle: false })];
  const taps = [];
  const frames = [[0.2, 0.5], [0.5, 0.5], [0.52, 0.5], [0.5, 0.48], [0.2, 0.5], [0.5, 0.5]];
  frames.forEach(([x, y], i) => {
    for (const event of hands.update(i * 1000, pointing(x, y), watch, over)) taps.push([i, event.type]);
  });
  assert.deepEqual(taps, [[1, "tap"], [5, "tap"]]);
  assert.equal(hands.cursor.over, true);
});

test("an open hand passing over the model doesn't tap", () => {
  const hands = new HandInteraction();
  const events = [0.2, 0.5, 0.8].flatMap((x, i) => hands.update(i * 1000, [hand(x, 0.7)], watch, over));
  assert.deepEqual(events, []);
});

test("a pinch closing on the model grabs it, drags while held, releases when opened", () => {
  const hands = new HandInteraction();
  const types = [];
  const frames = [
    hand(0.5, 0.7), // open, on the model
    hand(0.5, 0.7, { pinch: true }), // closes: grabs
    hand(0.55, 0.7, { pinch: true }), // moves: drags
    hand(0.7, 0.7, { pinch: true }), // off the model, still held: drags
    hand(0.7, 0.7), // opens: lets go
  ];
  frames.forEach((points, i) => types.push(...hands.update(i * 50, [points], watch, over).map((event) => event.type)));
  assert.deepEqual(types, ["drag", "drag", "release"]);
});

test("a pinch closing off the model grabs nothing", () => {
  const hands = new HandInteraction();
  const frames = [hand(0.2, 0.7, { pinch: true }), hand(0.5, 0.7, { pinch: true }), hand(0.5, 0.7)];
  const events = frames.flatMap((points, i) => hands.update(i * 50, [points], watch, over));
  assert.deepEqual(events, []);
});

test("the hand wearing the watch is ignored; the other one counts", () => {
  const hands = new HandInteraction();
  // The watch's wrist, its finger pointing onto the model: nothing.
  const wearing = hand(0.5, 0.78, { middle: false });
  assert.deepEqual(hands.update(0, [wearing], { ...watch, y: 0.78 }, over), []);
  assert.equal(hands.cursor, null);
  // The free hand from the side does tap.
  const free = hand(0.5, 0.7, { middle: false });
  const events = hands.update(1000, [wearing, free], { x: 0.5, y: 0.78, radius: 0.02 }, over);
  assert.deepEqual(events.map((event) => event.type), ["tap"]);
});

test("losing the hand while it holds the model lets go", () => {
  const hands = new HandInteraction();
  hands.update(0, [hand(0.5, 0.7)], watch, over);
  hands.update(50, [hand(0.5, 0.7, { pinch: true })], watch, over);
  assert.deepEqual(hands.update(100, [], watch, over), [{ type: "release" }]);
  assert.equal(hands.cursor, null);
});
