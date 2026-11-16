// The viewer: the rear camera's image, the marker found in it, and an axis gizmo
// drawn where the marker is (milestone 2). Nothing leaves the browser: the frames
// are read from a canvas here and dropped.
import * as THREE from "../vendor/three/three.module.js";
import { MarkerTracker } from "./tracker.js";
import { PoseSmoother } from "./smoothing.js";

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

const video = document.getElementById("camera");
const overlay = document.getElementById("overlay");
const status = document.getElementById("status");
const start = document.getElementById("start");

function report(text, state) {
  status.textContent = text;
  document.body.dataset.state = state;
}

function fail(error) {
  console.error(error);
  report(error.message || String(error), "error");
}

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
}

function scene() {
  const renderer = new THREE.WebGLRenderer({ canvas: overlay, alpha: true, antialias: true });
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
  const world = new THREE.Scene();
  const anchor = new THREE.Group();
  anchor.matrixAutoUpdate = false;
  // The gizmo: red x, green y, blue z out of the marker's face; and its outline.
  anchor.add(new THREE.AxesHelper(MARKER_SIZE));
  const half = MARKER_SIZE / 2;
  const outline = new THREE.BufferGeometry().setFromPoints(
    [[-half, half], [half, half], [half, -half], [-half, -half], [-half, half]].map(([x, y]) => new THREE.Vector3(x, y, 0)),
  );
  anchor.add(new THREE.Line(outline, new THREE.LineBasicMaterial({ color: 0xffd200 })));
  anchor.visible = false;
  world.add(anchor);
  return { renderer, camera, world, anchor };
}

async function run() {
  start.hidden = true;
  report("Opening the camera…", "starting");
  await openCamera();
  const frame = document.createElement("canvas");
  const context = frame.getContext("2d", { willReadFrequently: true });
  const tracker = new MarkerTracker({ markerSize: MARKER_SIZE, fovDegrees: FOV_DEGREES });
  const smoother = new PoseSmoother();
  const view = scene();
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
    const markers = tracker.detect(context.getImageData(0, 0, width, height));
    const marker = markers[0];
    const pose = marker ? tracker.pose(marker, width, height) : null;
    const smoothed = pose ? smoother.update(pose, now) : smoother.lost(now);
    if (smoothed) {
      view.anchor.matrix.compose(smoothed.position, smoothed.quaternion, new THREE.Vector3(1, 1, 1));
      view.anchor.visible = true;
    } else {
      view.anchor.visible = false;
    }
    if (marker && pose) {
      report(`Marker ${marker.id}, ${Math.round(-smoothed.position.z)} mm away`, "tracking");
      document.body.dataset.markerId = String(marker.id);
    } else if (!smoothed) {
      report("Looking for a marker…", "searching");
      delete document.body.dataset.markerId;
    }
    view.renderer.render(view.world, view.camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

start.addEventListener("click", () => run().catch(fail));
if (params.has("autostart")) {
  run().catch(fail);
}
