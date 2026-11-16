// End-to-end tests of the marker page and the viewer in Chromium (Playwright),
// under nginx.conf's Content-Security-Policy (server.mjs):
// - every marker the page draws is found by the detector, with its ID, also seen
//   at an angle and rotated;
// - a frontal marker's pose gives the distance the camera model predicts;
// - the viewer, fed a marker through Chromium's fake camera, shows its model (or
//   the gizmo for an ID without content) and the debug overlay;
// - content.json passes its check, and the models stand on the marker.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let server;
let browser;

before(async () => {
  server = await serve();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

// A page that fails the test on any error in its console or any CSP violation.
async function open(context, path) {
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (event) =>
      console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`),
    ),
  );
  await page.goto(`${server.url}${path}`);
  return { page, problems };
}

// The detector, run in the page on a PNG (bytes): the IDs it finds.
async function detectIds(page, png) {
  return page.evaluate(async (data) => {
    const { MarkerTracker } = await import("/js/tracker.js");
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const tracker = new MarkerTracker({ markerSize: 20, fovDegrees: 65 });
    return tracker.detect(context.getImageData(0, 0, canvas.width, canvas.height)).map((marker) => marker.id);
  }, png.toString("base64"));
}

test("every marker of the marker page is detected with its ID, at an angle and rotated", async () => {
  const context = await browser.newContext({ viewport: { width: 800, height: 900 } });
  const { page, problems } = await open(context, "/markers.html?id=0");
  const sheet = page.locator(".marker-sheet");
  const views = [
    "none",
    "perspective(900px) rotateX(35deg) rotateZ(20deg) scale(0.6)",
    "rotate(90deg) scale(0.3)",
    "perspective(700px) rotateY(-40deg) rotateZ(-160deg) scale(0.45)",
  ];
  for (let id = 0; id < 50; id++) {
    await page.evaluate((value) => {
      const input = document.getElementById("id");
      input.value = String(value);
      input.dispatchEvent(new Event("change"));
    }, id);
    for (const transform of views) {
      await sheet.evaluate((element, value) => (element.style.transform = value), transform);
      const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 800, height: 700 } });
      assert.deepEqual(await detectIds(page, shot), [id], `marker ${id} seen as ${transform}`);
    }
  }
  assert.deepEqual(problems, []);
  await context.close();
});

test("a frontal marker's pose has the distance the camera model predicts, facing the camera", async () => {
  const context = await browser.newContext();
  const { page, problems } = await open(context, "/index.html");
  const result = await page.evaluate(async () => {
    const { MarkerTracker, focalLength } = await import("/js/tracker.js");
    const { drawMarker, MARKER_CELLS } = await import("/js/markers.js");
    const { toThree } = await import("/js/smoothing.js");
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context2d = canvas.getContext("2d");
    context2d.fillStyle = "#888";
    context2d.fillRect(0, 0, 640, 480);
    const cell = 20;
    const side = MARKER_CELLS * cell;
    context2d.fillStyle = "#fff";
    context2d.fillRect(320 - side / 2 - cell, 240 - side / 2 - cell, side + 2 * cell, side + 2 * cell);
    drawMarker(context2d, 7, 320 - side / 2, 240 - side / 2, cell);
    const tracker = new MarkerTracker({ markerSize: 20, fovDegrees: 65 });
    const [marker] = tracker.detect(context2d.getImageData(0, 0, 640, 480));
    const pose = tracker.pose(marker, 640, 480);
    const { position, quaternion } = toThree(pose.best);
    return {
      id: marker.id,
      distance: -position.z,
      expected: (focalLength(640, 65) * 20) / side,
      angle: (2 * Math.acos(Math.min(1, Math.abs(quaternion.w))) * 180) / Math.PI,
    };
  });
  assert.equal(result.id, 7);
  assert.ok(Math.abs(result.distance - result.expected) / result.expected < 0.03, JSON.stringify(result));
  assert.ok(result.angle < 3, `the marker faces the camera: ${JSON.stringify(result)}`);
  assert.deepEqual(problems, []);
  await context.close();
});

// A Y4M video (Chromium's fake camera reads it) of one frame: marker `id` on a grey
// background, drawn by the marker page's code, slightly turned.
async function markerVideo(id, path) {
  const context = await browser.newContext();
  const { page } = await open(context, "/markers.html");
  const rgba = await page.evaluate(async (value) => {
    const { drawMarker, MARKER_CELLS } = await import("/js/markers.js");
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const c = canvas.getContext("2d");
    c.fillStyle = "#777";
    c.fillRect(0, 0, 640, 480);
    c.translate(320, 240);
    c.rotate(0.3);
    const cell = 18;
    const side = MARKER_CELLS * cell;
    c.fillStyle = "#fff";
    c.fillRect(-side / 2 - cell, -side / 2 - cell, side + 2 * cell, side + 2 * cell);
    drawMarker(c, value, -side / 2, -side / 2, cell);
    return Array.from(c.getImageData(0, 0, 640, 480).data);
  }, id);
  await context.close();
  // RGBA to 4:2:0 YUV (BT.601, full range as C420jpeg says).
  const [width, height] = [640, 480];
  const y = Buffer.alloc(width * height);
  const u = Buffer.alloc((width / 2) * (height / 2));
  const v = Buffer.alloc((width / 2) * (height / 2));
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
      y[row * width + col] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      if (row % 2 === 0 && col % 2 === 0) {
        const j = (row / 2) * (width / 2) + col / 2;
        u[j] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
        v[j] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
      }
    }
  }
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`);
  await writeFile(path, Buffer.concat([header, Buffer.from("FRAME\n"), y, u, v]));
}

// The viewer in a Chromium whose fake camera shows marker `id`, at `path`; calls
// `check(page)` once it has found the marker, then fails on any page error.
async function withCamera(id, path, check) {
  const directory = await mkdtemp(join(tmpdir(), "wristmark-"));
  try {
    const video = join(directory, "marker.y4m");
    await markerVideo(id, video);
    const camera = await chromium.launch({
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${video}`,
      ],
    });
    try {
      const { page, problems } = await open(await camera.newContext(), path);
      await page.waitForSelector(`body[data-marker-id="${id}"]`, { timeout: 15000 });
      await check(page);
      assert.deepEqual(problems, []);
    } finally {
      await camera.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("the viewer shows the model content.json gives the camera's marker, and the debug overlay", async () => {
  await withCamera(1, "/index.html?autostart&debug", async (page) => {
    assert.match(await page.locator("#status").textContent(), /^Marker 1 \(Torus knot\), \d+ mm away$/);
    assert.equal(await page.locator("body").getAttribute("data-model"), "knot");
    // The overlay is rewritten every 250 ms: wait for a second of frames.
    await page.waitForTimeout(1200);
    const debug = await page.locator("#debug").textContent();
    assert.match(debug, /^ID {10}1$/m);
    assert.match(debug, /^distance {4}\d+ mm$/m);
    assert.match(debug, /^FPS {9}[1-9]\d*$/m);
    assert.match(debug, /^detection {3}\d+ % of frames$/m);
    assert.match(debug, /^camera {6}640x480$/m);
    // The toggle hides it.
    await page.locator("#debug-toggle").click();
    assert.equal(await page.locator("#debug").isHidden(), true);
  });
});

test("a marker without content gets the gizmo and says so", async () => {
  await withCamera(23, "/index.html?autostart", async (page) => {
    assert.match(await page.locator("#status").textContent(), /^Marker 23 \(no content\), \d+ mm away$/);
    assert.equal(await page.locator("body").getAttribute("data-model"), null);
    assert.equal(await page.locator("#debug").isHidden(), true);
  });
});

test("content.json passes its check, and every model stands on the marker", async () => {
  const context = await browser.newContext();
  const { page, problems } = await open(context, "/index.html");
  const results = await page.evaluate(async () => {
    const THREE = await import("/vendor/three/three.module.js");
    const { loadContent } = await import("/js/content.js");
    const { createModel, MODEL_NAMES } = await import("/js/models.js");
    const content = await loadContent("/content.json", MODEL_NAMES);
    return {
      mapped: [...content.values()].map((entry) => entry.model),
      models: MODEL_NAMES.map((name) => {
        const model = createModel(name, 20);
        model.animate(1.5);
        model.object.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model.object);
        return { name, min: box.min.toArray(), max: box.max.toArray() };
      }),
    };
  });
  assert.deepEqual(new Set(results.mapped), new Set(results.models.map((model) => model.name)), "every model is mapped");
  for (const { name, min, max } of results.models) {
    // On the marker's face (z = 0) and above it, within a few marker sizes.
    assert.ok(min[2] >= -0.5, `${name} starts at the marker's face: ${min}`);
    assert.ok(max[2] > 5 && max[2] < 60, `${name} stands up out of the watch: ${max}`);
    assert.ok(Math.max(...max.map(Math.abs), ...min.map(Math.abs)) < 60, `${name} is a few markers wide`);
  }
  assert.deepEqual(problems, []);
  await context.close();
});

// The watch's table and the screen it draws, without the SDK: the codes of
// watch/source/MarkerDictionary.mc read with MarkerView's bit formula, and its
// layout on the D2 Mach 1's 416-pixel round display (MarkerView.onUpdate, mirrored
// here; the simulator's screenshots check the real one once CI can build it).
test("the watch's table and its 416-pixel round layout give the detector's markers", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../watch/source/MarkerDictionary.mc", import.meta.url), "utf8");
  const codes = source
    .match(/const CODES = \[([\s\S]*?)\]/)[1]
    .split(",")
    .map((value) => Number(value.trim()));
  assert.equal(codes.length, 50);
  const context = await browser.newContext({ viewport: { width: 520, height: 520 } });
  const { page, problems } = await open(context, "/markers.html");
  const results = await page.evaluate(async (watchCodes) => {
    const { markerDictionary } = await import("/js/markers.js");
    const { MarkerTracker } = await import("/js/tracker.js");
    const library = markerDictionary().codeList;
    const tracker = new MarkerTracker({ markerSize: 18.6, fovDegrees: 65 });
    const canvas = document.createElement("canvas");
    canvas.width = 520;
    canvas.height = 520;
    const c = canvas.getContext("2d");
    return watchCodes.map((code, id) => {
      // MarkerView's bits: bit 15 the top left data cell, row by row, 1 white.
      const bits = Array.from({ length: 16 }, (_, i) => (code >> (15 - i)) & 1).join("");
      // MarkerView.onUpdate on 416 x 416, centered in a lighter surrounding.
      const [size, radius, cells] = [416, 208, 6];
      const cell = Math.trunc(radius / (cells / Math.SQRT2 + 1));
      const side = cells * cell;
      const [left, top] = [260 - side / 2, 260 - side / 2];
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = "#999";
      c.fillRect(0, 0, 520, 520);
      c.save();
      c.beginPath();
      c.arc(260, 260, size / 2, 0, 2 * Math.PI);
      c.clip();
      c.fillStyle = "#000";
      c.fillRect(0, 0, 520, 520);
      c.fillStyle = "#fff";
      c.fillRect(left - cell, top - cell, side + 2 * cell, side + 2 * cell);
      c.fillStyle = "#000";
      for (let row = 0; row < cells; row++) {
        for (let col = 0; col < cells; col++) {
          const border = row === 0 || col === 0 || row === cells - 1 || col === cells - 1;
          if (border || bits[(row - 1) * 4 + (col - 1)] === "0") {
            c.fillRect(left + col * cell, top + row * cell, cell, cell);
          }
        }
      }
      c.restore();
      const found = tracker.detect(c.getImageData(0, 0, 520, 520)).map((marker) => marker.id);
      return { id, cell, same: bits === library[id], found };
    });
  }, codes);
  for (const { id, cell, same, found } of results) {
    assert.ok(same, `the watch's code ${id} differs from the detector's`);
    assert.equal(cell, 39, "a 39-pixel cell on the D2 Mach 1");
    assert.deepEqual(found, [id], `the watch's marker ${id} on its round display`);
  }
  assert.deepEqual(problems, []);
  await context.close();
});
