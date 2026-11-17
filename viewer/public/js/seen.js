// Directions as the camera sees them, in a model's own frame: for models that respond
// to how the watch is held. Without the phone's sensors the camera is taken as
// upright, so the image's down stands in for gravity (docs/model-ideas.md).
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

// The image's down, standing in for gravity.
export const imageDown = (object, viewer, target) => asSeen(object, viewer, 0, -1, 0, target);

// Away from the viewer, into the picture: "down" for a maze looked into.
export const intoPicture = (object, viewer, target) => asSeen(object, viewer, 0, 0, -1, target);
