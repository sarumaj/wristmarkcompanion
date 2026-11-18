// End-to-end tests of the marker page and the viewer in Chromium (Playwright),
// under nginx.conf's Content-Security-Policy (server.mjs):
// - every marker the page draws is found by the detector, with its ID, also seen
//   at an angle and rotated;
// - a frontal marker's pose gives the distance the camera model predicts;
// - the viewer, fed a marker through Chromium's fake camera, shows its model (or
//   the gizmo for an ID without content) and the debug overlay, with the marker's
//   outline drawn and the search around it;
// - content.json passes its check, and the models stand on the marker;
// - the guided device test measures a step and reports it;
// - a camera that can't be opened shows the error card;
// - hand tracking loads under the CSP;
// - the models that react to gestures and taps take them; a tap, a drag and the
//   arrows on the model;
// - the icons, the manifest and the social card are served;
// - the privacy page is served and linked.
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
async function open(context, path, prepare = async () => {}) {
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (event) =>
      console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`),
    ),
  );
  await prepare(page);
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
test("the models that react to a tap take it, and the action buttons reach them", async () => {
  const context = await browser.newContext();
  const { page, problems } = await open(context, "/index.html");
  const result = await page.evaluate(async () => {
    const THREE = await import("/vendor/three/three.module.js");
    const { createModel, MODEL_NAMES, MODEL_GUIDES } = await import("/js/models.js");
    const reacting = {};
    for (const name of MODEL_NAMES) {
      const model = createModel(name, 20);
      // At 12.5 s: the balloon between burns, the rocket's pad waiting.
      model.animate(12.5);
      // A tap anywhere on it: the first mesh (the orrery's sun).
      let mesh = null;
      model.object.traverse((node) => (mesh ??= node.isMesh ? node : null));
      const answer = model.touch?.({ object: mesh, point: new THREE.Vector3(), t: 12500 });
      model.animate(13);
      model.animate(16);
      if (answer) reacting[name] = typeof answer === "string" ? answer : answer.text;
    }
    // Each touch action belongs to a model that has a touch.
    const actions = Object.entries(MODEL_GUIDES).filter(([, guide]) => (guide.actions ?? []).some((action) => action.touch));
    const orphans = actions.filter(([name]) => !createModel(name, 20).touch).map(([name]) => name);
    // A planet tapped says its distance.
    const orrery = createModel("orrery", 20);
    let mars = null;
    orrery.object.traverse((node) => (mars ??= node.userData.planet === "mars" ? node : null));
    return { reacting, orphans, mars: orrery.touch({ object: mars }).text };
  });
  assert.deepEqual(result.reacting, {
    orrery: "The Sun",
    aquarium: "Startled",
    balloon: "Burner",
    rocket: "Countdown",
    maze: "Ball back",
    penguin: "Hop",
    windmill: "Gust",
    sailboat: "Coming about",
    ferrisWheel: "Lights",
    bonsai: "Shaken",
    atom: "Excited",
    dna: "Unzipped",
    newtonsCradle: "2 balls",
    metronome: "120 a minute",
    volcano: "Erupting",
    ufo: "Beam",
    train: "Whistle",
    cake: "Make a wish",
    jellyfish: "Swim",
    butterflies: "Scattered",
    carousel: "Faster",
    raceTrack: "Boost",
    satellite: "Ping",
    // What the sundial reads depends on the clock.
    sundial: result.reacting.sundial,
    lavaLamp: "Ocean",
    castle: "Drawbridge up",
    house: "Lights",
    snowman: "Hello!",
    puzzleCube: "Hurry",
    blackHole: "Fed a star",
    treasureChest: "Closed",
    raincloud: "Thunder",
  });
  assert.match(result.reacting.sundial, /^(The sundial reads \d\d:\d\d|Night: no shadow)$/);
  assert.deepEqual(result.orphans, []);
  assert.match(result.mars, /^Mars, 1\.[3-7]\d au from the Sun$/);
  assert.deepEqual(problems, []);
  await context.close();
});

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
async function withCamera(id, path, check, prepare) {
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
      const { page, problems } = await open(await camera.newContext(), path, prepare);
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
    assert.equal(await page.locator("#status").textContent(), "Earth, day and night");
    assert.equal(await page.locator("body").getAttribute("data-model"), "earth");
    // The watch's display is drawn black under the model.
    assert.equal(await page.locator("body").getAttribute("data-screen"), "covered");
    // The wheel zooms the model, a double click puts it back.
    await page.locator(".stage").hover();
    await page.mouse.wheel(0, -300);
    await page.waitForFunction(() => Number(document.body.dataset.zoom) > 1.2);
    assert.equal(await page.locator("#zoom").isVisible(), true);
    await page.locator(".stage").dblclick();
    await page.waitForFunction(() => document.body.dataset.zoom === "1.00");
    // The overlay is rewritten every 250 ms: wait for a second of frames.
    await page.waitForTimeout(1200);
    const row = (key) => page.locator(`#debug [data-key="${key}"] dd`).textContent();
    assert.equal(await row("id"), "1");
    assert.match(await row("distance"), /^\d+ mm$/);
    assert.match(await row("fps"), /^[1-9]\d*$/);
    // Once per camera frame (the fake camera's 30 a second), not per display refresh.
    assert.ok(Number(await row("fps")) <= 32, `fps ${await row("fps")}`);
    assert.match(await row("detection"), /^\d+ %$/);
    assert.match(await row("camera"), /^640x480$/);
    assert.equal(await page.locator("#debug .debug-chart").count(), 1);
    // Once found, the marker is looked for around where it was, at the camera's resolution.
    assert.match(await row("detected-at"), /around the watch at \d+x\d+/);
    // The marker's outline is drawn over the image, in green.
    const green = await page.evaluate(() => {
      const canvas = document.getElementById("marks");
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 1] > 180 && data[i] < 120 && data[i + 3] > 200) count++;
      return count;
    });
    assert.ok(green > 50, `${green} green pixels`);
    // The toggle hides it.
    await page.locator("#debug-toggle").click();
    assert.equal(await page.locator("#debug").isHidden(), true);
    assert.equal(await page.locator("#marks").isHidden(), true);
  });
});

test("a model's hint, its action buttons, keys, full screen and the help", async () => {
  await withCamera(15, "/index.html?autostart", async (page) => {
    assert.equal(await page.locator("#status").textContent(), "Dice · Tap it, flick or shake your wrist to roll");
    // The button does what the gesture does, and says so.
    await page.getByRole("button", { name: "Roll" }).click();
    assert.equal(await page.locator("#gesture").textContent(), "Roll ✓");
    // Keys resize; 0 puts it back.
    await page.keyboard.press("+");
    await page.waitForFunction(() => Number(document.body.dataset.zoom) > 1.1);
    await page.keyboard.press("0");
    await page.waitForFunction(() => document.body.dataset.zoom === "1.00");
    // Full screen, and Escape leaves it.
    await page.getByRole("button", { name: "Full screen" }).click();
    assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("immersive")), true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.body.classList.contains("immersive"));
    // The help, from its button and from ?, closed with Escape.
    await page.locator(".topbar").getByRole("button", { name: "Help" }).click();
    assert.equal(await page.locator("#help").isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#help").isVisible(), false);
    await page.keyboard.press("?");
    assert.equal(await page.locator("#help").isVisible(), true);
  });
});

test("one finger on the model: a tap rolls the dice, a drag and the arrows turn it", async () => {
  await withCamera(15, "/index.html?autostart", async (page) => {
    const box = await page.locator("#overlay").boundingBox();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    // The watch is in the image's middle: the dice's felt is there.
    await page.mouse.click(x, y);
    assert.equal(await page.locator("#gesture").textContent(), "Roll ✓");
    assert.ok(await page.locator("body").getAttribute("data-touched"));
    // A quarter circle around the watch, counterclockwise on screen, turns it about 90°.
    const radius = box.height / 4;
    await page.mouse.move(x + radius, y);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) {
      const angle = (step / 12) * (Math.PI / 2);
      await page.mouse.move(x + radius * Math.cos(angle), y - radius * Math.sin(angle));
    }
    await page.mouse.up();
    const turned = Number(await page.locator("body").getAttribute("data-turn"));
    assert.ok(turned > 70, `turned ${turned}°`);
    // 0 puts it back; an arrow turns 15°.
    await page.keyboard.press("0");
    await page.waitForFunction(() => document.body.dataset.turn === "0");
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(() => document.body.dataset.turn === "15");
  });
});

test("hand tracking loads under the CSP, from the viewer's own origin, and looks for hands", async () => {
  await withCamera(15, "/index.html?autostart&hands", async (page) => {
    const requests = [];
    page.on("request", (request) => requests.push(new URL(request.url()).origin));
    await page.waitForFunction(() => ["on", "failed"].includes(document.body.dataset.hands), null, { timeout: 60000 });
    assert.equal(await page.locator("body").getAttribute("data-hands"), "on");
    assert.equal(await page.locator("#hands").getAttribute("aria-pressed"), "true");
    // No hand in the picture: no cursor.
    await page.waitForFunction(() => document.body.dataset.hand === "none");
    assert.equal(await page.locator("#hand-cursor").isHidden(), true);
    assert.deepEqual([...new Set(requests)].filter((origin) => origin !== new URL(page.url()).origin), []);
    // H switches it off.
    await page.keyboard.press("h");
    assert.equal(await page.locator("body").getAttribute("data-hands"), "off");
  });
});

// F-Droid's build leaves MediaPipe out and marks the page (tools/build-app-web.sh,
// WRISTMARK_HANDS=off): no hand button, and ?hands and H load nothing.
test("a build without hand tracking hides its button and loads nothing for it", async () => {
  const withoutHands = async (page) => {
    await page.route(/\/index\.html/, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="wristmark-hands" content="off">');
      await route.fulfill({ response, body });
    });
  };
  await withCamera(
    15,
    "/index.html?autostart&hands",
    async (page) => {
      const requests = [];
      page.on("request", (request) => requests.push(request.url()));
      await page.keyboard.press("h");
      assert.equal(await page.locator("#hands").isHidden(), true);
      assert.notEqual(await page.locator("body").getAttribute("data-hands"), "on");
      assert.deepEqual(requests.filter((url) => url.includes("mediapipe")), []);
    },
    withoutHands,
  );
});

test("the size chosen is kept for the next visit, and forgotten when put back", async () => {
  const context = await browser.newContext();
  const { page, problems } = await open(context, "/index.html");
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  const chosen = await page.locator("body").getAttribute("data-zoom");
  assert.ok(Number(chosen) > 1.2, chosen);
  await page.reload();
  await page.waitForFunction((value) => document.body.dataset.zoom === value, chosen);
  await page.keyboard.press("0");
  await page.reload();
  assert.equal(await page.evaluate(() => localStorage.getItem("wristmark.zoom")), null);
  assert.equal(await page.locator("body").getAttribute("data-zoom"), null);
  assert.deepEqual(problems, []);
  await context.close();
});

test("gravity from the phone's tilt: the math, and the button that switches it on", async () => {
  // The math: upright in portrait, flat face up, and the screen turned.
  const context = await browser.newContext();
  const { page: plain, problems: plainProblems } = await open(context, "/index.html");
  const math = await plain.evaluate(async () => {
    const { deviceGravity, onScreen } = await import("/js/seen.js");
    const round = (vector) => vector.map((value) => Math.round(value * 1000) / 1000 + 0);
    return {
      upright: round(deviceGravity(90, 0)),
      flat: round(deviceGravity(0, 0)),
      rolled: round(deviceGravity(0, 90)),
      turned: round(onScreen([0, 1, 0], 90)),
    };
  });
  assert.deepEqual(math, { upright: [0, -1, 0], flat: [0, 0, -1], rolled: [1, 0, 0], turned: [-1, 0, 0] });
  assert.deepEqual(plainProblems, []);
  await context.close();
  // The button, on the attitude indicator: readings come, it says so and goes.
  await withCamera(21, "/index.html?autostart&sensors", async (page) => {
    const button = page.getByRole("button", { name: "Use the phone's tilt" });
    await button.click();
    await page.evaluate(() => {
      const send = () => window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: 0, beta: 80, gamma: 10 }));
      setInterval(send, 50);
    });
    await page.waitForFunction(() => document.body.dataset.sensors === "on");
    assert.equal(await page.locator("#gesture").textContent(), "Gravity from the phone's sensors");
    assert.equal(await button.count(), 0);
    // Granted, as a user allows it when the browser asks.
  }, (page) => page.context().grantPermissions(["accelerometer", "gyroscope"]));
});

test("a marker without content gets the gizmo and says so", async () => {
  // Every ID has a model: this one is taken out of the content the page gets.
  const withoutLast = async (page) =>
    page.route("**/content.json", async (route) => {
      const content = await (await route.fetch()).json();
      delete content.markers["49"];
      await route.fulfill({ json: content });
    });
  await withCamera(49, "/index.html?autostart", async (page) => {
    assert.equal(await page.locator("#status").textContent(), "Marker 49 has no model yet");
    assert.equal(await page.locator("body").getAttribute("data-model"), null);
    assert.equal(await page.locator("body").getAttribute("data-screen"), null);
    assert.equal(await page.locator("#debug").isHidden(), true);
  }, withoutLast);
});

test("the guided device test measures a range step and reports it", async () => {
  await withCamera(1, "/index.html?test&autostart&capture=1&countdown=0", async (page) => {
    const guide = page.locator("#guide");
    await guide.getByRole("button", { name: "Range" }).click();
    await guide.getByRole("button", { name: "indoor lamp" }).click();
    await guide.getByRole("checkbox").check();
    await guide.getByRole("button", { name: "Start" }).click();
    assert.doesNotMatch(await guide.textContent(), /null|undefined/);
    await guide.getByRole("button", { name: "Measure" }).click();
    await guide.getByRole("button", { name: "Save and next" }).click({ timeout: 10000 });
    assert.match(await guide.textContent(), /2 of 6/);
    await guide.getByRole("button", { name: "Sections" }).click();
    assert.match(await guide.textContent(), /1 measured/);
    await guide.getByRole("button", { name: "Report" }).click();
    const markdown = await guide.locator(".guide-report").textContent();
    assert.match(markdown, /^\| indoor lamp \| red light \| 15 +\| \d+ +\| (9\d|100) +\|/m);
    // The live line shows the marker it sees.
    assert.match(await guide.locator(".guide-live").textContent(), /^ID 1 /);
  });
});

test("a camera that can't be opened shows the error card with a way to try again", async () => {
  // A Chromium without a camera: getUserMedia fails, as when the permission is refused.
  const context = await browser.newContext();
  const { page } = await open(context, "/index.html");
  await page.locator("#start").click();
  await page.waitForSelector('body[data-state="error"]');
  assert.equal(await page.locator(".failure").isVisible(), true);
  // In words a person can act on, the browser's own message small below.
  assert.match(await page.locator("#failure-text").textContent(), /^No camera was found\./);
  assert.match(await page.locator("#failure-detail").textContent(), /^NotFoundError: /);
  assert.equal(await page.locator("#retry").isVisible(), true);
  assert.equal(await page.locator(".intro").isVisible(), false);
  await context.close();
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

test("the models that react to the wrist's gestures take them, and keep animating", async () => {
  const context = await browser.newContext();
  const { page, problems } = await open(context, "/index.html");
  const reacting = await page.evaluate(async () => {
    const { createModel, MODEL_NAMES } = await import("/js/models.js");
    const result = {};
    for (const name of MODEL_NAMES) {
      const model = createModel(name, 20);
      model.animate(1);
      const taken = ["flick", "twist", "shake", "hold"].filter((gesture) => model.gesture?.({ name: gesture, t: 1000, direction: 1 }) === true);
      model.animate(1.5);
      model.animate(4);
      if (taken.length) result[name] = taken;
    }
    return result;
  });
  assert.deepEqual(reacting, {
    robot: ["flick"],
    snowglobe: ["flick", "shake"],
    orrery: ["twist"],
    fireworks: ["flick", "shake"],
    dice: ["flick", "shake"],
    campfire: ["shake"],
  });
  assert.deepEqual(problems, []);
  await context.close();
});

test("the icons, the web app manifest and the social card are served and linked", async () => {
  const context = await browser.newContext();
  const { page, problems } = await open(context, "/index.html");
  const result = await page.evaluate(async () => {
    const manifestHref = document.querySelector('link[rel="manifest"]').getAttribute("href");
    const manifest = await (await fetch(manifestHref)).json();
    const files = [
      ...manifest.icons.map((icon) => icon.src),
      document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"),
      ...[...document.querySelectorAll('link[rel="icon"]')].map((link) => link.getAttribute("href")),
      new URL(document.querySelector('meta[property="og:image"]').content).pathname.slice(1),
    ];
    const statuses = await Promise.all(files.map(async (file) => [file, (await fetch(file)).status]));
    return { name: manifest.name, maskable: manifest.icons.some((icon) => icon.purpose === "maskable"), statuses };
  });
  assert.equal(result.name, "WristMarkCompanion");
  assert.equal(result.maskable, true);
  for (const [file, status] of result.statuses) assert.equal(status, 200, file);
  assert.deepEqual(problems, []);
  await context.close();
});

test("the privacy page is served under the CSP, in English and German, and linked from the viewer", async () => {
  const context = await browser.newContext();
  const { page, problems } = await open(context, "/index.html");
  await page.locator('footer a[href="privacy.html"]').click();
  await page.waitForURL(/privacy\.html$/);
  assert.equal(await page.title(), "WristMarkCompanion privacy");
  assert.match(await page.locator("main").textContent(), /never sent, saved or recorded/);
  assert.equal(await page.locator('#deutsch[lang="de"]').textContent(), "Datenschutz");
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
