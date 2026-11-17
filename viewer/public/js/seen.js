// Directions as the camera sees them, in a model's own frame: for models that respond
// to how the watch is held. Gravity comes from the phone's motion sensors once they are
// switched on (startMotion); without them the camera is taken as upright, so the
// image's down stands in for gravity, and the line of sight for a maze looked into.
import * as THREE from "../vendor/three/three.module.js";

const camera = new THREE.Quaternion();
const own = new THREE.Quaternion();

// The direction `x, y, z` of the camera's frame (y up, z toward the viewer) in the
// frame of `object`, into `target`, normalized.
export function asSeen(object, viewer, x, y, z, target) {
  viewer.getWorldQuaternion(camera);
  object.getWorldQuaternion(own).invert();
  return target.set(x, y, z).applyQuaternion(camera).applyQuaternion(own).normalize();
}

// Gravity in the camera's frame from the sensors, smoothed, and when it was last read.
// Older than this, it doesn't count (the sensors stopped, or the page was hidden).
const STALE_MS = 1000;
const sensed = new THREE.Vector3();
let sensedAt = -Infinity;
const fresh = () => performance.now() - sensedAt < STALE_MS;

// Gravity in the device's frame (x to the right of the screen, y to its top, z out of it
// toward the user) from deviceorientation's beta and gamma (degrees): the earth's down
// turned into the device by the inverse of its tilt, Rx(beta) then Ry(gamma).
export function deviceGravity(beta, gamma) {
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;
  return [Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g)];
}

// A vector of the device's frame in the screen's, the screen turned by `angle` degrees
// (screen.orientation.angle: 90 with the phone's top to the left). The rear camera's
// image is the screen's, so this is also the camera's frame.
export function onScreen([x, y, z], angle) {
  const a = (angle * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
}

function sense(event) {
  if (event.beta === null || event.gamma === null) return;
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  const [x, y, z] = onScreen(deviceGravity(event.beta, event.gamma), angle);
  // Smoothed: the sensors shake with the hand.
  if (fresh()) sensed.lerp(new THREE.Vector3(x, y, z), 0.25).normalize();
  else sensed.set(x, y, z);
  sensedAt = performance.now();
}

// Starts reading gravity from the motion sensors, asking for permission where the browser
// wants it (Safari on iPhone, from a tap). Resolves to whether readings come within a
// second: a laptop has no sensors and says nothing.
export async function startMotion() {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return false;
  }
  window.addEventListener("deviceorientation", sense);
  for (let i = 0; i < 10 && !fresh(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!fresh()) window.removeEventListener("deviceorientation", sense);
  return fresh();
}

// Whether gravity comes from the sensors now.
export const sensing = fresh;

// Down: gravity from the sensors, or the image's down.
export function imageDown(object, viewer, target) {
  return fresh() ? asSeen(object, viewer, sensed.x, sensed.y, sensed.z, target) : asSeen(object, viewer, 0, -1, 0, target);
}

// "Down" for a maze looked into: gravity from the sensors (hold the watch flat and look
// down at it), or away from the viewer, into the picture.
export function intoPicture(object, viewer, target) {
  return fresh() ? asSeen(object, viewer, sensed.x, sensed.y, sensed.z, target) : asSeen(object, viewer, 0, 0, -1, target);
}
