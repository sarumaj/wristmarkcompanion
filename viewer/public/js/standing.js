// The models are built with y up, as three.js's geometries are; this turns y into
// the marker's z, out of the watch. Returns the model's root and the group to build in.
import * as THREE from "../vendor/three/three.module.js";

export function standing(...children) {
  const group = new THREE.Group();
  group.rotation.x = Math.PI / 2;
  group.add(...children);
  const root = new THREE.Group();
  root.add(group);
  return { root, group };
}
