// The viewer: the camera's image (a phone's rear camera, or a laptop's webcam), the
// marker found in it, and the model content.json gives its ID drawn on it; an ID
// without one gets an axis gizmo. A debug overlay shows what the range tests need.
// Nothing leaves the browser: the frames are read from a canvas here and dropped.
import * as THREE from "../vendor/three/three.module.js";
import { MarkerTracker } from "./tracker.js";
import { PoseSmoother } from "./smoothing.js";
import { loadContent } from "./content.js";
import { createModel, lights, MODEL_GUIDES, MODEL_NAMES } from "./models.js";
import { DebugStats } from "./debug.js";
import { zoomControl } from "./zoom.js";
import { GestureRecognizer } from "./gestures.js";
import { touchControl, Turntable } from "./touch.js";
import { HandInteraction } from "./hands.js";
import { sensing, startMotion } from "./seen.js";

const params = new URLSearchParams(location.search);
// The marker's black square, in millimeters: about the D2 Mach 1's (the watch's
// layout fixes it exactly). The desktop marker page shows other sizes; give its
// size as ?size=.
const MARKER_SIZE = Number(params.get("size")) || 20;
// The models are built this many times the marker's size, so that they read well at
// arm's length: the marker is under 2 cm. ?scale= sets it.
const MODEL_SCALE = Number(params.get("scale")) || 2.5;
// The watch's round display, in marker sides: the D2 Mach 1's is 416 pixels across, its
// marker 234 (docs/watch.md). Where a model shows, the display is drawn black over the
// camera's image, so the model stands on a dark watch face, not on the marker. ?screen=0
// leaves the marker visible.
const SCREEN_RATIO = params.has("screen") ? Number(params.get("screen")) : 416 / 234;
// The camera's horizontal field of view, assumed (docs/decisions/003-pose.md).
const FOV_DEGREES = Number(params.get("fov")) || 65;
// Frames are scaled to a width for detection: 640 pixels to start with, enough for the
// marker's cells at arm's length and fast on a mid-range phone. Where detection is
// quick, the width grows toward the camera's own, so that a far marker keeps enough
// pixels (at 75 cm, 640 pixels leave it 13 wide: its distance read 16 % short in the
// first device test); where it is slow, it shrinks back. ?detect= fixes the width.
const DETECT_WIDTHS = params.has("detect") ? [Number(params.get("detect"))] : [640, 960, 1280, 1920];
// Faster than this on average (ms), the next width; slower than the second, the one before.
const DETECT_FAST_MS = 6;
const DETECT_SLOW_MS = 18;
// The date the moon and the globe show: now, or ?date= (e.g. 2026-12-24T18:00Z) to
// see another day, the clock running on from it.
const DATE_OFFSET = params.has("date") ? Date.parse(params.get("date")) - Date.now() : 0;
const now = () => new Date(Date.now() + DATE_OFFSET);

const video = document.getElementById("camera");
const stage = document.querySelector(".stage");
const overlay = document.getElementById("overlay");
const status = document.getElementById("status");
const start = document.getElementById("start");
const debugPanel = document.getElementById("debug");
const debugToggle = document.getElementById("debug-toggle");
const actions = document.getElementById("actions");
const help = document.getElementById("help");
// After this long without the watch in view, the status gives tips.
const TIPS_AFTER_MS = 6000;
// The guided device test (?test, docs/device-tests.md), fed every processed frame.
// ?capture= and ?countdown= shorten its measurements (seconds), for the tests.
let guide = null;

function showDebug(visible) {
  debugPanel.hidden = !visible;
  debugToggle.setAttribute("aria-pressed", String(visible));
}
showDebug(params.has("debug"));
debugToggle.addEventListener("click", () => showDebug(debugPanel.hidden));

// The status line. It changes only when its text does: screen readers announce it
// (role="status"), and a line rewritten every frame would be repeated endlessly.
function report(text, state) {
  if (status.textContent !== text) status.textContent = text;
  if (document.body.dataset.state !== state) document.body.dataset.state = state;
}

// What went wrong, in words a person can act on; the browser's own message is kept
// below it, small, for a support question.
function explain(error) {
  const advice = {
    NotAllowedError: "Camera access was declined. Allow the camera for this site in your browser's settings, then try again.",
    SecurityError: "Camera access was declined. Allow the camera for this site in your browser's settings, then try again.",
    NotFoundError: "No camera was found. Connect one, or open this page on your phone.",
    OverconstrainedError: "No camera was found. Connect one, or open this page on your phone.",
    NotReadableError: "The camera is busy in another app. Close it there, then try again.",
    AbortError: "The camera is busy in another app. Close it there, then try again.",
  };
  return advice[error?.name] ?? error?.message ?? String(error);
}

function fail(error) {
  console.error(error);
  const text = explain(error);
  report(text, "error");
  document.getElementById("failure-text").textContent = text;
  const detail = error?.message && error.message !== text ? `${error.name ?? "Error"}: ${error.message}` : "";
  document.getElementById("failure-detail").textContent = detail;
}
document.getElementById("retry").addEventListener("click", () => location.reload());

// The cameras to switch between, and the one open now (its deviceId).
let cameras = [];
let cameraId = null;

async function openCamera(deviceId = null) {
  if (!window.isSecureContext) {
    throw new Error("The camera only works on a secure (https://) address. Open the viewer's https:// address instead.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser can't use the camera. Try a current Chrome, Safari, Firefox or Edge.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  for (const track of video.srcObject?.getTracks() ?? []) track.stop();
  video.srcObject = stream;
  cameraId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
  // Their labels and IDs are known once the permission is given; a second camera
  // brings the switch.
  cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
  document.getElementById("switch-camera").hidden = cameras.length < 2;
  await video.play();
  // The stage takes the camera's aspect, so that the overlay lies exactly on the image;
  // a phone turned around changes it.
  const fit = () => video.videoWidth && stage.style.setProperty("--aspect", String(video.videoWidth / video.videoHeight));
  fit();
  video.addEventListener("resize", fit);
}

function scene() {
  const renderer = new THREE.WebGLRenderer({ canvas: overlay, alpha: true, antialias: true });
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
  const world = new THREE.Scene();
  world.add(...lights());
  const anchor = new THREE.Group();
  anchor.matrixAutoUpdate = false;
  // The gizmo: red x, green y, blue z out of the marker's face; and its outline.
  const gizmo = new THREE.Group();
  gizmo.add(new THREE.AxesHelper(MARKER_SIZE));
  const half = MARKER_SIZE / 2;
  const outline = new THREE.BufferGeometry().setFromPoints(
    [[-half, half], [half, half], [half, -half], [-half, -half], [-half, half]].map(([x, y]) => new THREE.Vector3(x, y, 0)),
  );
  gizmo.add(new THREE.Line(outline, new THREE.LineBasicMaterial({ color: 0xffd200 })));
  anchor.add(gizmo);
  // The watch's display, black, a hair above the marker's face so that it hides it.
  const screen = new THREE.Mesh(
    new THREE.CircleGeometry((MARKER_SIZE * SCREEN_RATIO) / 2, 64),
    new THREE.MeshBasicMaterial({ color: 0x050608, transparent: true }),
  );
  screen.position.z = 0.05;
  screen.visible = false;
  anchor.add(screen);
  anchor.visible = false;
  world.add(anchor);
  return { renderer, camera, world, anchor, gizmo, screen };
}

// The phone's motion sensors, offered where there may be some: a touch screen with the
// orientation events (laptops have the events, but no sensors). ?sensors offers them
// anywhere, for the tests.
const MAY_SENSE = params.has("sensors") || (typeof DeviceOrientationEvent !== "undefined" && matchMedia("(pointer: coarse)").matches);
async function useSensors(button) {
  button.disabled = true;
  const on = await startMotion().catch(() => false);
  if (on) {
    // Done with: gone (the buttons' display would override `hidden`).
    button.remove();
    actions.hidden = actions.childElementCount === 0;
    document.body.dataset.sensors = "on";
    acknowledge("Gravity from the phone's sensors", { tick: false });
  } else {
    button.disabled = false;
    acknowledge("No motion sensors to use here", { tick: false });
  }
}

// The buttons that do what the model's gestures do (MODEL_GUIDES).
function showActions(view, entry) {
  const guide = entry ? MODEL_GUIDES[entry.model] : null;
  const offered = (guide?.actions ?? []).filter(({ sensor }) => !sensor || (MAY_SENSE && !sensing()));
  actions.replaceChildren(
    ...offered.map(({ label, gesture, direction = 1, touch, sensor }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        if (sensor) {
          useSensors(button);
          return;
        }
        const t = performance.now();
        const done = touch ? view.model?.touch?.({ t }) : view.model?.gesture?.({ name: gesture, direction, t });
        if (done) acknowledge(label);
      });
      return button;
    }),
  );
  actions.hidden = actions.childElementCount === 0;
}

// A chip on the stage for a moment: the model took a gesture or an action (with a
// tick), or tells what was tapped (a planet's name: longer, and without).
const gestureChip = document.getElementById("gesture");
let gestureShown = 0;
function acknowledge(text, { tick = true } = {}) {
  gestureChip.textContent = tick ? `${text} ✓` : text;
  gestureChip.hidden = false;
  clearTimeout(gestureShown);
  gestureShown = setTimeout(() => (gestureChip.hidden = true), tick ? 900 : 2500);
}

// The model under a tap at (x, y) in the window, and what it does: the model's own
// `touch(hit)` (a label, or {text, tick: false} to tell something), else the one action
// its guide has (the dice roll). Every hit gives a little hop, so a tap never goes
// unnoticed. Returns whether the model was hit.
function tapModel(view, entry, x, y, t) {
  const hit = modelAt(view, x, y);
  if (!hit) return false;
  view.hop = t;
  document.body.dataset.touched = hit.object.name || hit.object.type;
  const own = view.model.touch?.({ object: hit.object, point: view.model.object.worldToLocal(hit.point.clone()), t });
  if (own) {
    if (typeof own === "string") acknowledge(own);
    else acknowledge(own.text, own);
    return true;
  }
  const actionsOf = MODEL_GUIDES[entry?.model]?.actions ?? [];
  if (actionsOf.length === 1) {
    const [{ label, gesture, direction = 1 }] = actionsOf;
    if (view.model.gesture?.({ name: gesture, direction, t })) acknowledge(label);
  }
  return true;
}

// The model's nearest shown part at (x, y) in the window, or null.
const raycaster = new THREE.Raycaster();
function modelAt(view, x, y) {
  if (!view.model || !view.anchor.visible) return null;
  const box = overlay.getBoundingClientRect();
  const pointer = new THREE.Vector2(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
  raycaster.setFromCamera(pointer, view.camera);
  return raycaster.intersectObject(view.model.object, true).find(({ object }) => isShown(object)) ?? null;
}

// Shown, its parents included: the raycaster also finds hidden meshes.
function isShown(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

// Where the anchor's origin, the watch's center, is in the window.
function anchorOnScreen(view) {
  const box = overlay.getBoundingClientRect();
  const point = new THREE.Vector3().setFromMatrixPosition(view.anchor.matrixWorld).project(view.camera);
  return { x: box.left + ((point.x + 1) / 2) * box.width, y: box.top + ((1 - point.y) / 2) * box.height };
}

// What the status says about a marker: the model's name and its hint, or that the ID
// has no model.
function describe(id, entry) {
  if (!entry) return `Marker ${id} has no model yet`;
  const hint = MODEL_GUIDES[entry.model]?.hint;
  return hint ? `${entry.name} · ${hint}` : entry.name;
}

// What the anchor shows for marker `id`: its model, or the gizmo alone.
function show(view, content, id) {
  if (view.model) {
    view.anchor.remove(view.model.object);
    view.model = null;
  }
  const entry = content.get(id);
  if (entry) {
    view.model = createModel(entry.model, MARKER_SIZE * MODEL_SCALE, { now });
    view.anchor.add(view.model.object);
    document.body.dataset.model = entry.model;
  } else {
    delete document.body.dataset.model;
  }
  // The gizmo with every model in the debug view, alone where there is no model.
  view.gizmo.visible = !entry || !debugPanel.hidden;
  // The black display under a model only.
  view.screen.visible = Boolean(entry) && SCREEN_RATIO > 0;
  if (view.screen.visible) document.body.dataset.screen = "covered";
  else delete document.body.dataset.screen;
  showActions(view, entry);
  return entry;
}

async function run() {
  start.hidden = true;
  if (Number.isNaN(DATE_OFFSET)) {
    throw new Error(`?date=${params.get("date")} is not a date (e.g. 2026-12-24T18:00Z)`);
  }
  report("Loading the content…", "starting");
  const content = await loadContent("content.json", MODEL_NAMES);
  report("Opening the camera…", "starting");
  await openCamera();
  guide?.cameraStarted();
  const frame = document.createElement("canvas");
  const context = frame.getContext("2d", { willReadFrequently: true });
  const tracker = new MarkerTracker({ markerSize: MARKER_SIZE, fovDegrees: FOV_DEGREES });
  let smoother = new PoseSmoother();
  const view = scene();
  const stats = new DebugStats();
  // The wrist's gestures, from the smoothed pose; the model may react to them.
  const gestures = new GestureRecognizer();
  let lastGesture = null;
  let shownId = null;
  let entry = null;
  let lastSeen = performance.now();
  document.getElementById("switch-camera").addEventListener("click", async () => {
    const next = cameras[(cameras.findIndex((camera) => camera.deviceId === cameraId) + 1) % cameras.length];
    await openCamera(next.deviceId).catch(fail);
  });
  // One finger or the mouse: a tap on the model, a drag turning it about the watch.
  touchControl(stage, {
    tap: (x, y) => tapModel(view, entry, x, y, performance.now()),
    drag: (x, y, dx, dy) => {
      if (!view.model || !view.anchor.visible) return;
      const center = anchorOnScreen(view);
      turntable.drag(x, y, dx, dy, center.x, center.y, performance.now());
    },
    release: () => turntable.release(),
  });
  report("Looking for the watch…", "searching");
  let previous = performance.now();
  let handsAt = -Infinity;
  if (params.has("hands")) setHands(true);

  // Detection once per camera frame: the display refreshes faster (60 or 120 times a
  // second) than a camera delivers (about 30), and a frame looked at twice tells nothing
  // new. Drawing goes on at the display's rate, for smooth animations. Without
  // requestVideoFrameCallback, a new frame is one with another time.
  let cameraFrames = 0;
  let handledFrame = -1;
  let handledTime = -1;
  if (video.requestVideoFrameCallback) {
    const count = () => {
      cameraFrames++;
      video.requestVideoFrameCallback(count);
    };
    video.requestVideoFrameCallback(count);
  }
  const freshFrame = () => {
    if (video.requestVideoFrameCallback) {
      if (cameraFrames === handledFrame) return false;
      handledFrame = cameraFrames;
      return true;
    }
    if (video.currentTime === handledTime) return false;
    handledTime = video.currentTime;
    return true;
  };
  // The last camera frame's findings, kept for the display's frames in between.
  let marker = null;
  let pose = null;
  let smoothed = null;
  let detectMs = 0;
  let image = null;

  // The detection's width, as DETECT_WIDTHS allows and the camera has, looked at again
  // every two seconds.
  let widthIndex = 0;
  let widthCheckedAt = performance.now();
  const adaptWidth = (now) => {
    if (now - widthCheckedAt < 2000) return;
    widthCheckedAt = now;
    const { detectMs: average, fps } = stats.summary();
    if (!fps) return;
    const next = DETECT_WIDTHS[widthIndex + 1];
    if (average < DETECT_FAST_MS && next && next <= video.videoWidth) widthIndex++;
    else if (average > DETECT_SLOW_MS && widthIndex > 0) widthIndex--;
  };

  const loop = (now) => {
    adaptWidth(now);
    const width = Math.min(DETECT_WIDTHS[widthIndex], video.videoWidth || DETECT_WIDTHS[0]);
    const height = Math.round((width * video.videoHeight) / video.videoWidth);
    if (frame.width !== width || frame.height !== height) {
      frame.width = width;
      frame.height = height;
      // The same field of view as the detection's focal length, vertically.
      view.camera.fov = (2 * Math.atan(Math.tan((FOV_DEGREES * Math.PI) / 360) * (height / width)) * 180) / Math.PI;
    }
    const box = overlay.getBoundingClientRect();
    view.renderer.setSize(box.width, box.height, false);
    view.camera.aspect = width / height;
    view.camera.updateProjectionMatrix();

    const fresh = freshFrame();
    if (fresh) {
      context.drawImage(video, 0, 0, width, height);
      const detectStart = performance.now();
      image = context.getImageData(0, 0, width, height);
      marker = tracker.detect(image)[0] ?? null;
      pose = marker ? tracker.pose(marker, width, height) : null;
      detectMs = performance.now() - detectStart;
      stats.frame(now, detectMs, Boolean(pose));

      // Another marker: its own content, and a pose of its own from scratch.
      if (marker && marker.id !== shownId) {
        shownId = marker.id;
        smoother = new PoseSmoother();
        gestures.reset();
        turntable.reset();
        entry = show(view, content, shownId);
      }
      smoothed = pose ? smoother.update(pose, now) : smoother.lost(now);
      const recognized = gestures.update(
        pose && smoothed
          ? { t: now, tracked: true, position: smoothed.position.toArray(), quaternion: smoothed.quaternion.toArray() }
          : { t: now, tracked: false },
      );
      for (const event of recognized) {
        lastGesture = event;
        // A gesture the model reacts to is confirmed for a moment; any shows in the debug view.
        const handled = view.model?.gesture?.(event) === true;
        document.body.dataset.gesture = event.name;
        if (handled || !debugPanel.hidden) acknowledge(event.name);
      }
    }
    if (smoothed) {
      view.anchor.matrix.compose(smoothed.position, smoothed.quaternion, new THREE.Vector3(1, 1, 1));
      view.anchor.visible = true;
      view.model?.animate(now / 1000);
      // The size by hand, a hop for a moment after a tap, and the turn by hand.
      const hop = view.hop ? (now - view.hop) / 350 : 1;
      const bounce = hop < 1 ? 1 + 0.12 * Math.sin(hop * Math.PI) : 1;
      view.model?.object.scale.setScalar(zoom.value * bounce);
      turntable.step(now - previous);
      if (view.model) view.model.object.rotation.z = turntable.angle;
      document.body.dataset.turn = String(Math.round((turntable.angle * 180) / Math.PI));
      view.gizmo.visible = !entry || !debugPanel.hidden;
      // In the debug view the marker shows through, to see what the detector sees.
      view.screen.material.opacity = debugPanel.hidden ? 1 : 0.55;
    } else {
      view.anchor.visible = false;
    }
    const distance = smoothed ? Math.round(-smoothed.position.z) : null;
    if (guide && fresh) {
      guide.frame(guideFrame(now, detectMs, pose && marker, smoothed, image));
    }
    if (marker && pose) {
      lastSeen = now;
      document.body.classList.remove("with-tips");
      report(describe(marker.id, entry), "tracking");
      document.body.dataset.markerId = String(marker.id);
    } else if (!smoothed) {
      const long = now - lastSeen > TIPS_AFTER_MS;
      report(
        long ? "Can't see the watch: hold it 20 to 50 cm away, its display toward the camera, in good light" : "Looking for the watch…",
        "searching",
      );
      document.body.classList.toggle("with-tips", long);
      delete document.body.dataset.markerId;
    }
    if (!debugPanel.hidden) {
      stats.render(debugPanel, now, {
        id: smoothed ? shownId : null,
        distance,
        camera: `${video.videoWidth}x${video.videoHeight}`,
        gesture: lastGesture ? `${lastGesture.name}, ${((now - lastGesture.t) / 1000).toFixed(1)} s ago` : "–",
        detection: `${width}x${height}`,
        hands: handTracker && handsWanted ? `${handsSeen} seen, ${handsMs.toFixed(0)} ms` : "off",
      });
    }
    if (handTracker && handsWanted && now - handsAt >= HAND_INTERVAL_MS) {
      handsAt = now;
      followHands(view, entry, now, Boolean(smoothed));
    }
    view.renderer.render(view.world, view.camera);
    previous = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// The guide's view of a frame: the smoothed pose as numbers, the marker's face
// (its z axis) and its tilt from the line of sight, and the image to measure the
// marker's brightness in.
function guideFrame(t, detectMs, marker, smoothed, image) {
  if (!marker || !smoothed) {
    return { t, detectMs, found: false };
  }
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(smoothed.quaternion);
  const toCamera = smoothed.position.clone().negate().normalize();
  return {
    t,
    detectMs,
    found: true,
    id: marker.id,
    distance: -smoothed.position.z,
    position: smoothed.position.toArray(),
    normal: normal.toArray(),
    tilt: THREE.MathUtils.radToDeg(normal.angleTo(toCamera)),
    image,
    corners: marker.corners,
  };
}

// The size by hand (pinch, wheel, keys), shown for a moment in a chip on the stage.
const zoomChip = document.getElementById("zoom");
let zoomShown = 0;
// The size chosen is kept in the browser for the next visit (the privacy page says so);
// back at 1, nothing is kept. Storage may be off or full: then it is only not kept.
const ZOOM_KEY = "wristmark.zoom";
const keep = (value) => {
  try {
    if (Math.abs(value - 1) < 0.005) localStorage.removeItem(ZOOM_KEY);
    else localStorage.setItem(ZOOM_KEY, value.toFixed(2));
  } catch {
    // Not kept.
  }
};
const zoom = zoomControl(stage, (value) => {
  zoomChip.textContent = `${value.toFixed(1)}×`;
  zoomChip.hidden = false;
  document.body.dataset.zoom = value.toFixed(2);
  clearTimeout(zoomShown);
  zoomShown = setTimeout(() => (zoomChip.hidden = true), 1200);
  keep(value);
});
try {
  const kept = Number(localStorage.getItem(ZOOM_KEY));
  if (kept > 0) {
    zoom.set(kept);
    zoomChip.hidden = true;
  }
} catch {
  // Nothing kept, or no storage: the size stays 1.
}

// The other hand in the camera's image (js/hands.js), when switched on: the hand button,
// H, or ?hands. Its library and model load on first use; the hands are looked for 20
// times a second, which leaves the marker's detection most of the time.
const HAND_INTERVAL_MS = 50;
const handsButton = document.getElementById("hands");
const handCursor = document.getElementById("hand-cursor");
const handInteraction = new HandInteraction();
let handTracker = null;
let handsWanted = false;
// For the debug view: the tracker's time per look (smoothed) and the hands it saw.
let handsMs = 0;
let handsSeen = 0;
async function setHands(on) {
  handsWanted = on;
  handsButton.setAttribute("aria-pressed", String(on));
  if (!on) {
    document.body.dataset.hands = "off";
    handCursor.hidden = true;
    acknowledge("Hand tracking off", { tick: false });
    return;
  }
  if (!handTracker) {
    document.body.dataset.hands = "loading";
    handsButton.setAttribute("aria-busy", "true");
    acknowledge("Loading hand tracking…", { tick: false });
    try {
      const { loadHandTracker } = await import("./hands.js");
      handTracker = await loadHandTracker();
    } catch (error) {
      console.warn("Hand tracking couldn't start:", error);
      handsWanted = false;
      handsButton.setAttribute("aria-pressed", "false");
      document.body.dataset.hands = "failed";
      acknowledge("Hand tracking couldn't start in this browser", { tick: false });
      return;
    } finally {
      handsButton.removeAttribute("aria-busy");
    }
  }
  if (!handsWanted) return;
  document.body.dataset.hands = "on";
  acknowledge("Hand tracking on: point at the model, or pinch it to turn it", { tick: false });
}
handsButton.addEventListener("click", () => setHands(!handsWanted));

// One look for the hands: the free hand's taps and grabs go where a finger's would, and
// its fingertip shows as a cursor. The image's coordinates (0 to 1) are the overlay's.
function followHands(view, entry, now, tracked) {
  const box = overlay.getBoundingClientRect();
  const client = (x, y) => ({ x: box.left + x * box.width, y: box.top + y * box.height });
  let watch = null;
  if (tracked) {
    const center = anchorOnScreen(view);
    const edge = new THREE.Vector3((MARKER_SIZE * SCREEN_RATIO) / 2, 0, 0).applyMatrix4(view.anchor.matrixWorld).project(view.camera);
    const x = (center.x - box.left) / box.width;
    const y = (center.y - box.top) / box.height;
    watch = { x, y, radius: Math.hypot((edge.x + 1) / 2 - x, (1 - edge.y) / 2 - y) };
  }
  const started = performance.now();
  const hands = handTracker.detect(video, now);
  handsMs = 0.8 * handsMs + 0.2 * (performance.now() - started);
  handsSeen = hands.length;
  const over = (x, y) => {
    const at = client(x, y);
    return modelAt(view, at.x, at.y) !== null;
  };
  for (const event of handInteraction.update(now, hands, watch, over)) {
    if (event.type === "release") {
      turntable.release();
      continue;
    }
    const at = client(event.x, event.y);
    if (event.type === "tap") tapModel(view, entry, at.x, at.y, now);
    if (event.type === "drag") {
      const center = anchorOnScreen(view);
      turntable.drag(at.x, at.y, event.dx * box.width, event.dy * box.height, center.x, center.y, now);
    }
  }
  const cursor = handInteraction.cursor;
  handCursor.hidden = !cursor;
  document.body.dataset.hand = cursor ? (cursor.grabbing ? "grabbing" : cursor.pinching ? "pinching" : cursor.pointing ? "pointing" : "open") : "none";
  if (cursor) {
    handCursor.style.setProperty("--x", `${cursor.x * 100}%`);
    handCursor.style.setProperty("--y", `${cursor.y * 100}%`);
    handCursor.dataset.state = document.body.dataset.hand;
    handCursor.classList.toggle("over", cursor.over);
  }
}

// The model's turn by hand (a drag, or the arrow keys), about the watch's center; a
// double tap or click puts it back, with the size.
const turntable = new Turntable();
stage.addEventListener("dblclick", () => turntable.reset());

// Full screen: the page's own (Android, desktops), or the stage filling the window
// where a browser has none for pages (Safari on iPhone).
const expand = document.getElementById("expand");
function immersive(on) {
  document.body.classList.toggle("immersive", on);
  expand.setAttribute("aria-pressed", String(on));
  expand.setAttribute("aria-label", on ? "Leave full screen" : "Full screen");
  if (on && document.fullscreenEnabled && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (!on && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}
expand.addEventListener("click", () => immersive(!document.body.classList.contains("immersive")));
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) immersive(false);
});

for (const opener of document.querySelectorAll("[data-open-help]")) {
  opener.addEventListener("click", () => help.showModal());
}
document.getElementById("help-close").addEventListener("click", () => help.close());

// Keys: + and - resize, the left and right arrows turn, 0 resets both, h the hand
// tracking, d the debug view, f full screen, ? help, Escape
// leaves full screen. Not while typing in a field, and not with a modifier.
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input, textarea")) return;
  const keys = {
    "+": () => zoom.set(zoom.value * 1.15),
    "=": () => zoom.set(zoom.value * 1.15),
    "-": () => zoom.set(zoom.value / 1.15),
    0: () => {
      zoom.set(1);
      turntable.reset();
    },
    ArrowLeft: () => turntable.turn(Math.PI / 12),
    ArrowRight: () => turntable.turn(-Math.PI / 12),
    d: () => showDebug(debugPanel.hidden),
    h: () => setHands(!handsWanted),
    f: () => immersive(!document.body.classList.contains("immersive")),
    "?": () => help.showModal(),
    Escape: () => immersive(false),
  };
  // The arrows turn a model shown, and scroll the page (or the help) otherwise.
  if (event.key.startsWith("Arrow") && (!document.body.dataset.model || help.open)) return;
  if (keys[event.key]) {
    keys[event.key]();
    if (event.key !== "Escape") event.preventDefault();
  }
});

async function main() {
  if (params.has("test")) {
    const { startGuide } = await import("./guide.js");
    const content = await loadContent("content.json", MODEL_NAMES);
    guide = startGuide({
      root: document.getElementById("guide"),
      content,
      markerSize: MARKER_SIZE,
      captureSeconds: Number(params.get("capture")) || 10,
      countdownSeconds: params.has("countdown") ? Number(params.get("countdown")) : 3,
    });
  }
  start.addEventListener("click", () => run().catch(fail));
  if (params.has("autostart")) {
    await run();
  }
}

main().catch(fail);
