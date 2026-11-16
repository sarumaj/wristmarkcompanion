// The guided device test's measurements and report (public/js/guide-*.js), on
// made-up frames: what each number means is pinned down here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { farthest, markerBrightness, median, sessionTimes, summarize, verdict } from "../public/js/guide-metrics.js";
import { report, table } from "../public/js/guide-report.js";

const facing = [0, 0, 1];
const tilted = (deg) => [Math.sin((deg * Math.PI) / 180), 0, Math.cos((deg * Math.PI) / 180)];

// `count` frames 1000/30 ms apart, found where `found(i)` says.
function frames(count, { found = () => true, normal = () => facing, position = () => [0, 0, -300], brightness = () => 200 } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    t: (i * 1000) / 30,
    found: found(i),
    detectMs: 8,
    distance: 300,
    position: position(i),
    normal: normal(i),
    tilt: 0,
    brightness: brightness(i),
  }));
}

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test("a steady capture: every frame found, no jitter, no flips", () => {
  const summary = summarize(frames(300), 0, 10000);
  assert.equal(summary.rate, 1);
  assert.equal(Math.round(summary.fps), 30);
  assert.equal(summary.distance, 300);
  assert.equal(summary.flips, 0);
  assert.equal(summary.jitterMm, 0);
  assert.equal(verdict(summary), "yes");
});

test("the verdict: lost below half the frames, flips, then jitter", () => {
  assert.equal(verdict(summarize(frames(300, { found: (i) => i % 3 === 0 }))), "lost");
  // The face jumping 40 degrees back and forth: the planar marker's two poses.
  const flipping = summarize(frames(300, { normal: (i) => (Math.floor(i / 50) % 2 ? tilted(40) : facing) }));
  assert.equal(flipping.flips, 5);
  assert.equal(verdict(flipping), "flips");
  // Moving 4 mm back and forth.
  const shaking = summarize(frames(300, { position: (i) => [i % 2 ? 4 : -4, 0, -300] }));
  assert.ok(shaking.jitterMm > 3.9);
  assert.equal(verdict(shaking), "jitters");
});

test("the longest gap counts the capture's ends", () => {
  const summary = summarize(frames(300, { found: (i) => i < 150 }), 0, 10000);
  assert.ok(summary.longestGapMs >= 5000);
});

test("a session: dims when the marker's brightness drops, off when it is gone", () => {
  // The marker seen from 2 s (the app opened), dimming at 32 s, gone at 62 s.
  const run = frames(90 * 30, {
    found: (i) => i >= 60 && i < 62 * 30,
    brightness: (i) => (i >= 32 * 30 ? 90 : 200),
  });
  const times = sessionTimes(run);
  assert.equal(Math.round(times.dimsAfter), 30);
  assert.equal(Math.round(times.offAfter), 60);
  assert.equal(times.rateWhileDimmed, 1);
  // Never seen: nothing to time.
  assert.equal(sessionTimes(frames(100, { found: () => false })).offAfter, null);
});

test("the marker's brightness takes each pixel's brightest channel: red light counts", () => {
  const width = 20;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let i = 0; i < width * width; i++) {
    data.set([180, 0, 0, 255], i * 4);
  }
  const corners = [{ x: 2, y: 2 }, { x: 17, y: 2 }, { x: 17, y: 17 }, { x: 2, y: 17 }];
  assert.equal(markerBrightness({ width, height: width, data }, corners), 180);
});

test("the farthest distance with 90 % detection, per light", () => {
  const result = (lighting, distanceCm, rate, night = false) => ({ lighting, distanceCm, night, summary: { rate } });
  assert.deepEqual(
    farthest([result("indoor lamp", 30, 1), result("indoor lamp", 50, 0.95), result("indoor lamp", 75, 0.4), result("dark room", 30, 0.5, true)]),
    { "indoor lamp": 50, "dark room, red light": null },
  );
});

test("tables are aligned and escape pipes", () => {
  assert.equal(table(["A", "Bee"], [["x|y", null]]), "| A    | Bee |\n|------|-----|\n| x\\|y | -   |");
});

test("the report fills in the protocol's tables", () => {
  const summary = summarize(frames(300), 0, 10000);
  const markdown = report({
    setup: { date: "2026-11-16", watch: "D2 Mach 1, 20.26", markerMm: "18.6" },
    results: [
      { kind: "range", lighting: "dark room", night: true, distanceCm: 30, summary, auto: "yes", steady: "yes", note: "" },
      { kind: "angle", angle: 45, night: false, summary: { ...summary, tilt: 44 }, auto: "yes", steady: "jitters", note: "slight" },
      { kind: "session", startedBy: "opening app", night: false, dimsAfter: 30, offAfter: 60, rateWhileDimmed: 0.9, onAgain: "yes", note: "" },
      { kind: "model", id: 0, name: "Moon phase", summary, sits: "yes", smooth: "yes", sky: "yes", note: "" },
    ],
    battery: { before: "80", after: "78" },
    notes: "Works well.",
  });
  assert.match(markdown, /^\| Watch, firmware version +\| D2 Mach 1, 20\.26 +\|$/m);
  assert.match(markdown, /^\| dark room +\| red light +\| 30 +\| 300 +\| 100 +\| 30 +\| 8\.0 +\| yes +\| - +\|$/m);
  assert.match(markdown, /^- dark room, red light: 30 cm$/m);
  assert.match(markdown, /^\| 45 +\| 44 +\| normal +\| 100 +\| jitters +\| slight; measured: yes/m);
  assert.match(markdown, /^\| 1 +\| opening app +\| normal +\| 30 +\| 60 +\| 90 % of frames +\| yes +\| - +\|$/m);
  assert.match(markdown, /^\| 0 +\| Moon phase +\| yes +\| yes +\| 30 +\| matches the sky: yes +\|$/m);
  assert.match(markdown, /80 % → 78 %/);
  assert.match(markdown, /## 5\. Anything else\n\nWorks well\./);
});
