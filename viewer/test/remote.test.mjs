// Pairing with the watch and steering it, end to end in Chromium: the fake camera plays
// the 13 frames of the test vectors' secret, as the watch shows them; the relay is
// played by page.route, which opens what the viewer sends with the session's keys and
// answers with the watch's state, sealed here (public/js/channel.js runs in Node too).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { deriveSession, open, seal } from "../public/js/channel.js";
import { encodeFrames } from "../public/js/pairing.js";
import { viewerName } from "../public/js/remote.js";

const vectors = JSON.parse(await readFile(new URL("../../protocol/channel-vectors.json", import.meta.url), "utf8"));
const secret = Uint8Array.from(vectors.secret.match(/../g), (pair) => parseInt(pair, 16));
const session = await deriveSession(secret, { extractable: true });

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

// A Y4M video of the frames, each held for `hold` camera frames, slightly turned, as
// Chromium's fake camera plays it (in a loop).
async function pairingVideo(path, hold = 5) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${server.url}/markers.html`);
  const frames = await page.evaluate(async (ids) => {
    const { drawMarker, MARKER_CELLS } = await import("/js/markers.js");
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const c = canvas.getContext("2d");
    const cell = 13;
    return ids.map((frame) => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = "#777";
      c.fillRect(0, 0, 640, 480);
      c.translate(320, 240);
      c.rotate(0.2);
      const side = (2 * MARKER_CELLS + 3) * cell;
      c.fillStyle = "#fff";
      c.fillRect(-side / 2, -side / 2, side, side);
      [[1, 1], [8, 1], [1, 8], [8, 8]].forEach(([x, y], i) => drawMarker(c, frame[i], -side / 2 + x * cell, -side / 2 + y * cell, cell));
      // Gray only: the red channel is the brightness, sent as base64 (fast, unlike an array).
      const rgba = c.getImageData(0, 0, 640, 480).data;
      let text = "";
      for (let i = 0; i < rgba.length; i += 4) text += String.fromCharCode(rgba[i]);
      return btoa(text);
    });
  }, encodeFrames(secret));
  await context.close();
  const [width, height] = [640, 480];
  const chunks = [Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`)];
  const u = Buffer.alloc((width / 2) * (height / 2), 128);
  const v = Buffer.alloc((width / 2) * (height / 2), 128);
  for (const gray of frames) {
    const y = Buffer.from(gray, "base64");
    for (let k = 0; k < hold; k++) chunks.push(Buffer.from("FRAME\n"), y, u, v);
  }
  await writeFile(path, Buffer.concat(chunks));
}

// The relay, played: the viewer's requests answered, what it sends opened and kept.
async function playRelay(page, sent) {
  const seen = new Map();
  let states = 0;
  await page.route("**/relay/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const auth = request.headers().authorization;
    if (url.pathname.endsWith("/healthz")) return route.fulfill({ json: { status: "ok" } });
    if (request.method() === "PUT" && url.pathname.endsWith(`/channels/${session.id}`)) {
      assert.deepEqual(JSON.parse(request.postData()), session.hashes);
      return route.fulfill({ status: 201 });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/to-watch")) {
      assert.equal(auth, `Bearer ${session.tokens.viewer}`);
      sent.push(await open(session.keys.toWatch, "toWatch", JSON.parse(request.postData()), { now: Math.floor(Date.now() / 1000), seen }));
      return route.fulfill({ status: 202, json: { q: sent.length } });
    }
    if (request.method() === "GET" && url.pathname.endsWith("/to-viewer")) {
      assert.equal(auth, `Bearer ${session.tokens.viewer}`);
      // The watch answers each hello with its state, as WristmarkApp.command does; else quiet.
      const hellos = sent.filter((message) => message.op === "hello").length;
      let body = ": quiet\n\n";
      if (states < hellos) {
        states++;
        const state = await seal(session.keys.toViewer, "toViewer", { op: "state", id: 15, cycle: false, battery: 87 }, { r: new Uint8Array(8).fill(9), s: states, ts: Math.floor(Date.now() / 1000) });
        body = `id: ${states}\ndata: ${JSON.stringify(state)}\n\n`;
      }
      return route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body });
    }
    return route.fulfill({ status: 404, json: { detail: "not played" } });
  });
}

test("pairing through the camera, then steering the watch, and connected again after a reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wristmark-pair-"));
  try {
    const video = join(directory, "pairing.y4m");
    await pairingVideo(video);
    const camera = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
    });
    try {
      const context = await camera.newContext();
      const page = await context.newPage();
      const problems = [];
      page.on("pageerror", (error) => problems.push(error.message));
      const sent = [];
      await playRelay(page, sent);
      const started = Date.now();
      const mark = (what) => console.log(`${what} after ${((Date.now() - started) / 1000).toFixed(1)} s`);
      await page.goto(`${server.url}/index.html`);
      await page.getByRole("button", { name: "Watch", exact: true }).click();
      await page.getByRole("button", { name: "Pair with the watch" }).click();
      // Read in a few rounds of 13 frames, then the relay's handshake and the state.
      await page.waitForFunction(() => document.body.dataset.remote === "connected", null, { timeout: 30000 });
      mark("paired");
      assert.deepEqual(sent[0], { op: "hello", name: viewerName(await page.evaluate(() => navigator.userAgent)) });
      assert.match(await page.locator("#remote-text").textContent(), /marker 15.*87 %/);
      // Paired: the card makes way for the watch bar on the stage, whose buttons send their
      // commands; the card, opened again, has the same and Disconnect.
      assert.equal(await page.locator("#remote").isHidden(), true);
      const bar = page.getByRole("group", { name: "The paired watch" });
      await bar.getByRole("button", { name: "Next marker" }).click();
      await bar.getByRole("button", { name: "Find the watch" }).click();
      await page.getByRole("button", { name: "Watch", exact: true }).click();
      await page.locator("#remote").getByRole("button", { name: "Previous" }).click();
      assert.equal(await page.getByRole("button", { name: "Disconnect" }).isVisible(), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#remote").isHidden(), true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.deepEqual(sent.slice(1), [{ op: "step", delta: 1 }, { op: "buzz", ms: 300 }, { op: "step", delta: -1 }]);
      // Kept in IndexedDB: after a reload it connects again, without pairing.
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.remote === "connected", null, { timeout: 15000 });
      mark("connected again");
      assert.deepEqual(problems, []);
    } finally {
      await camera.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// A session kept from an earlier visit, as remote.js keeps it, with the vectors' secret.
async function keepSession(page) {
  await page.evaluate(async (hex) => {
    const { deriveSession } = await import("/js/channel.js");
    const derived = await deriveSession(Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16)));
    const now = Date.now();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("wristmark", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("sessions", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("sessions", "readwrite");
      transaction.objectStore("sessions").put({ id: derived.id, tokens: derived.tokens, hashes: derived.hashes, keys: derived.keys, pairedAt: now, usedAt: now, lastEvent: 0 });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, vectors.secret);
}

test("a kept pairing the watch doesn't answer can be forgotten, which ends it at the relay", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install();
  const calls = [];
  await page.route("**/relay/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push(`${request.method()} ${url.pathname.replace(/^.*\/relay\/v1/, "")}`);
    if (url.pathname.endsWith("/healthz")) return route.fulfill({ json: { status: "ok" } });
    if (request.method() === "PUT") return route.fulfill({ status: 204 });
    if (request.method() === "POST") return route.fulfill({ status: 202, json: { q: 1 } });
    if (request.method() === "DELETE") return route.fulfill({ status: 204 });
    // The watch never answers.
    return route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: ": quiet\n\n" });
  });
  await page.goto(`${server.url}/index.html`);
  await keepSession(page);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.remote === "waiting");
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  // Waiting at first, without a way out that would cut a slow watch short.
  assert.equal(await page.getByRole("button", { name: "Forget this pairing" }).isVisible(), false);
  await page.clock.fastForward(21000);
  await page.locator("#remote-text", { hasText: "hasn't answered" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Pair again" }).isVisible(), true);
  await page.getByRole("button", { name: "Forget this pairing" }).click();
  await page.waitForFunction(() => document.body.dataset.remote === "idle");
  assert.equal(await page.getByRole("button", { name: "Pair with the watch" }).isVisible(), true);
  // The watch is told (bye), the channel deleted, and nothing kept: a reload stays idle.
  assert.deepEqual(calls.filter((call) => /^(POST|DELETE)/.test(call)).map((call) => call.replace(/channels\/[^/]+/, "channels/ID")), ["POST /channels/ID/to-watch", "POST /channels/ID/to-watch", "DELETE /channels/ID"]);
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.evaluate(() => document.body.dataset.remote), "idle");
  await context.close();
});

test("a pairing the watch ended (the relay's 410) is forgotten, and the viewer says so", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/relay/v1/**", async (route) => {
    if (route.request().url().endsWith("/healthz")) return route.fulfill({ json: { status: "ok" } });
    return route.fulfill({ status: 410, json: { detail: "the other side ended this pairing" } });
  });
  await page.goto(`${server.url}/index.html`);
  await keepSession(page);
  await page.reload();
  await page.locator("#remote-text", { hasText: "The watch ended this pairing" }).waitFor({ state: "attached" });
  assert.equal(await page.evaluate(() => document.body.dataset.remote), "idle");
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("#remote-text").textContent().then((text) => text.includes("ended")), false);
  await context.close();
});

test("without a relay, the Watch button isn't offered", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${server.url}/index.html`);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("#remote-toggle").isHidden(), true);
  await context.close();
});

test("the viewer's name for the watch's list", () => {
  assert.equal(viewerName("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36"), "Chrome on Android");
  assert.equal(viewerName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605 Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.equal(viewerName("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/157 Safari/537.36 Edg/157"), "Edge on Mac");
});
