// The viewer: the camera's image (a phone's rear camera, or a laptop's webcam), the
// marker found in it, and the model content.json gives its ID drawn on it; an ID
// without one gets an axis gizmo. A debug overlay shows what the range tests need.
// Nothing leaves the browser: the frames are read from a canvas here and dropped.
import * as THREE from "../vendor/three/three.module.js";
import { MarkerTracker } from "./tracker.js";
import { PoseSmoother } from "./smoothing.js";
import { loadContent } from "./content.js";
import { createModel, lights, MODEL_NAMES } from "./models.js";
import { DebugStats } from "./debug.js";

const params = new URLSearchParams(location.search);
// The marker's black square, in millimeters: about the D2 Mach 1's (the watch's
// layout fixes it exactly). The desktop marker page shows other sizes; give its
// size as ?size=.
const MARKER_SIZE = Number(params.get("size")) || 20;
// The camera's horizontal field of view, assumed (docs/decisions/003-pose.md).
const FOV_DEGREES = Number(params.get("fov")) || 65;
// Frames are scaled to this width for detection: enough for the marker's cells at
// the distances aimed at, fast enough on a mid-range phone (to be measured).
const DETECT_WIDTH = 640;
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
// The guided device test (?test, docs/device-tests.md), fed every processed frame.
// ?capture= and ?countdown= shorten its measurements (seconds), for the tests.
let guide = null;

function showDebug(visible) {
  debugPanel.hidden = !visible;
  debugToggle.setAttribute("aria-pressed", String(visible));
}
showDebug(params.has("debug"));
debugToggle.addEventListener("click", () => showDebug(debugPanel.hidden));

function report(text, state) {
  status.textContent = text;
  document.body.dataset.state = state;
}

function fail(error) {
  console.error(error);
  report(error.message || String(error), "error");
  document.getElementById("failure-text").textContent = error.message || String(error);
}
document.getElementById("retry").addEventListener("click", () => location.reload());

async function openCamera() {
  if (!window.isSecureContext) {
    throw new Error("This page is not on HTTPS: the browser will not open the camera here.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser has no camera access (getUserMedia).");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
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
  anchor.visible = false;
  world.add(anchor);
  return { renderer, camera, world, anchor, gizmo };
}

// What the anchor shows for marker `id`: its model, or the gizmo alone.
function show(view, content, id) {
  if (view.model) {
    view.anchor.remove(view.model.object);
    view.model = null;
  }
  const entry = content.get(id);
  if (entry) {
    view.model = createModel(entry.model, MARKER_SIZE, { now });
    view.anchor.add(view.model.object);
    document.body.dataset.model = entry.model;
  } else {
    delete document.body.dataset.model;
  }
  // The gizmo with every model in the debug view, alone where there is no model.
  view.gizmo.visible = !entry || !debugPanel.hidden;
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
  let shownId = null;
  let entry = null;
  report("Looking for a marker…", "searching");

  const loop = (now) => {
    const width = DETECT_WIDTH;
    const height = Math.round((DETECT_WIDTH * video.videoHeight) / video.videoWidth);
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

    context.drawImage(video, 0, 0, width, height);
    const detectStart = performance.now();
    const image = context.getImageData(0, 0, width, height);
    const markers = tracker.detect(image);
    const marker = markers[0];
    const pose = marker ? tracker.pose(marker, width, height) : null;
    const detectMs = performance.now() - detectStart;
    stats.frame(now, detectMs, Boolean(pose));

    // Another marker: its own content, and a pose of its own from scratch.
    if (marker && marker.id !== shownId) {
      shownId = marker.id;
      smoother = new PoseSmoother();
      entry = show(view, content, shownId);
    }
    const smoothed = pose ? smoother.update(pose, now) : smoother.lost(now);
    if (smoothed) {
      view.anchor.matrix.compose(smoothed.position, smoothed.quaternion, new THREE.Vector3(1, 1, 1));
      view.anchor.visible = true;
      view.model?.animate(now / 1000);
      view.gizmo.visible = !entry || !debugPanel.hidden;
    } else {
      view.anchor.visible = false;
    }
    const distance = smoothed ? Math.round(-smoothed.position.z) : null;
    if (guide) {
      guide.frame(guideFrame(now, detectMs, pose && marker, smoothed, image));
    }
    if (marker && pose) {
      const what = entry ? entry.name : "no content";
      report(`Marker ${marker.id} (${what}), ${distance} mm away`, "tracking");
      document.body.dataset.markerId = String(marker.id);
    } else if (!smoothed) {
      report("Looking for a marker…", "searching");
      delete document.body.dataset.markerId;
    }
    if (!debugPanel.hidden) {
      stats.render(debugPanel, now, {
        id: smoothed ? shownId : null,
        distance,
        camera: `${video.videoWidth}x${video.videoHeight}`,
        detection: `${width}x${height}`,
      });
    }
    view.renderer.render(view.world, view.camera);
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
