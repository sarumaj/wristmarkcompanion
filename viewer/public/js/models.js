// The placeholder models, generated in code: no asset files, nothing to license
// beyond this project's own. Each one stands on the marker: in its anchor's frame
// x and y lie on the marker's face and z points out of it, in millimeters, and
// `size` is the marker's side. A model is {object, animate(seconds)}.
import * as THREE from "../vendor/three/three.module.js";

// The models are built with y up, as three.js's geometries are; this turns y into
// the marker's z, out of the watch.
function standing(...children) {
  const group = new THREE.Group();
  group.rotation.x = Math.PI / 2;
  group.add(...children);
  const root = new THREE.Group();
  root.add(group);
  return { root, group };
}

const MODELS = {
  // A cube with a color per face, on the marker, turning slowly.
  cube(size) {
    const colors = [0xe4572e, 0x29335c, 0xf3a712, 0x669bbc, 0xa8c686, 0xdb2b39].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    const side = size * 0.8;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(side, side, side), colors);
    cube.position.y = side / 2;
    const { root } = standing(cube);
    return { object: root, animate: (t) => (cube.rotation.y = t * 0.6) };
  },

  // A torus knot above the marker, turning.
  knot(size) {
    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(size * 0.35, size * 0.11, 128, 16),
      new THREE.MeshStandardMaterial({ color: 0x8e44ad, metalness: 0.3, roughness: 0.35 }),
    );
    knot.position.y = size * 0.9;
    const { root } = standing(knot);
    return {
      object: root,
      animate: (t) => {
        knot.rotation.y = t * 0.8;
        knot.rotation.x = Math.sin(t * 0.5) * 0.4;
      },
    };
  },

  // A planet with a ring and a moon around it.
  planet(size) {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.4, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a86ff, roughness: 0.8 }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.55, size * 0.75, 64),
      new THREE.MeshStandardMaterial({ color: 0xffbe0b, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2 - 0.4;
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.08, 16, 8),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    );
    const orbit = new THREE.Group();
    orbit.add(moon);
    moon.position.x = size * 1.0;
    const planet = new THREE.Group();
    planet.add(body, ring, orbit);
    planet.position.y = size * 0.9;
    const { root } = standing(planet);
    return {
      object: root,
      animate: (t) => {
        body.rotation.y = t * 0.3;
        orbit.rotation.y = t * 1.2;
      },
    };
  },

  // A flat-shaded crystal, floating up and down.
  crystal(size) {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(size * 0.45),
      new THREE.MeshStandardMaterial({ color: 0x2ec4b6, flatShading: true, metalness: 0.1, roughness: 0.2 }),
    );
    crystal.scale.y = 1.6;
    const { root } = standing(crystal);
    return {
      object: root,
      animate: (t) => {
        crystal.position.y = size * (1.0 + 0.15 * Math.sin(t * 1.5));
        crystal.rotation.y = t * 0.7;
      },
    };
  },
};

export const MODEL_NAMES = Object.keys(MODELS);

// A new instance of the model `name`, for a marker `size` millimeters wide.
export function createModel(name, size) {
  const make = MODELS[name];
  if (!make) {
    throw new Error(`no model "${name}"`);
  }
  return make(size);
}

// The light the models are shown in: from above the camera, and all around.
export function lights() {
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(0.3, 1, 1);
  return [new THREE.HemisphereLight(0xffffff, 0x444444, 1.2), sun];
}
