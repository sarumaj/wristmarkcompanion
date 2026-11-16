// Aviation, for an aviator's watch: a small plane landing on a runway on the watch,
// in a loop of the time alone.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";

const PERIOD = 12;

function box(width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// A light: a small glowing sphere.
function lamp(radius, color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 8, 6),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1 }),
  );
}

// A plane of `span` millimeters, nose toward -z.
function plane(span) {
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.4 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x0055aa, roughness: 0.5 });
  const group = new THREE.Group();
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(span * 0.06, span * 0.04, span * 0.9, 12), white);
  fuselage.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(span * 0.06, span * 0.15, 12), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -span * 0.52;
  group.add(
    fuselage,
    nose,
    box(span, span * 0.02, span * 0.16, blue, 0, 0, -span * 0.08),
    box(span * 0.36, span * 0.015, span * 0.1, blue, 0, span * 0.02, span * 0.4),
    box(span * 0.015, span * 0.16, span * 0.12, blue, 0, span * 0.1, span * 0.4),
    box(span * 0.02, span * 0.08, span * 0.02, white, span * 0.12, -span * 0.07, -span * 0.05),
    box(span * 0.02, span * 0.08, span * 0.02, white, -span * 0.12, -span * 0.07, -span * 0.05),
  );
  const strobe = lamp(span * 0.025, 0xff3030);
  strobe.position.set(0, span * 0.065, 0);
  group.add(strobe);
  return { group, strobe };
}

// The plane's place and pitch at `phase` seconds into the loop, along the runway's
// line (z, toward -z) and in height (y): the approach on a steep, made-up glide
// path, the flare, the touchdown and the rollout, braking to a stop.
function flight(phase, size) {
  const threshold = size * 0.7;
  const touchdown = size * 0.35;
  const stop = -size * 0.6;
  const start = size * 1.6;
  const height = size * 0.75;
  if (phase < 6) {
    const k = phase / 6;
    const z = start + (threshold - start) * k;
    return { z, y: size * 0.04 + height * (1 - k), pitch: -0.05, visible: true };
  }
  if (phase < 7.5) {
    // The flare: the nose up, the descent rounded out to the runway.
    const k = (phase - 6) / 1.5;
    return {
      z: threshold + (touchdown - threshold) * k,
      y: size * 0.04 * (1 - k * k),
      pitch: 0.15 * Math.sin(k * Math.PI * 0.9),
      visible: true,
    };
  }
  if (phase < 11) {
    // Braking: the speed falls evenly to zero.
    const k = (phase - 7.5) / 3.5;
    return { z: touchdown + (stop - touchdown) * (2 * k - k * k), y: 0, pitch: 0, visible: true };
  }
  return { z: stop, y: 0, pitch: 0, visible: phase < 11.6 };
}

// A runway on the watch, along its length, with its markings, edge lights and a
// row of approach lights flashing toward it ("the rabbit"), and the plane landing.
export function landing(size) {
  const length = size * 1.5;
  const width = size * 0.3;
  const scene = new THREE.Group();
  const tarmac = box(width, size * 0.02, length, new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.9 }), 0, size * 0.01, 0);
  scene.add(tarmac);
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  // The center line's dashes, and the threshold's bars at both ends.
  for (let z = -length / 2 + size * 0.15; z < length / 2 - size * 0.15; z += size * 0.12) {
    scene.add(box(size * 0.012, size * 0.004, size * 0.06, paint, 0, size * 0.022, z));
  }
  for (const end of [-1, 1]) {
    for (let i = -3; i <= 3; i++) {
      if (i !== 0) scene.add(box(size * 0.025, size * 0.004, size * 0.08, paint, i * size * 0.035, size * 0.022, end * (length / 2 - size * 0.06)));
    }
  }
  // The edge lights, white, and the approach lights before the threshold (+z).
  for (let z = -length / 2; z <= length / 2 + 0.01; z += length / 8) {
    for (const side of [-1, 1]) {
      const light = lamp(size * 0.012, 0xffffff);
      light.position.set(side * width * 0.55, size * 0.025, z);
      scene.add(light);
    }
  }
  const approach = Array.from({ length: 5 }, (_, i) => {
    const light = lamp(size * 0.016, 0xffffff);
    light.position.set(0, size * 0.02, length / 2 + size * (0.08 + 0.08 * (4 - i)));
    scene.add(light);
    return light;
  });
  const { group: aircraft, strobe } = plane(size * 0.42);
  scene.add(aircraft);
  const { root } = standing(scene);
  return {
    object: root,
    animate: (t) => {
      const phase = t % PERIOD;
      const { z, y, pitch, visible } = flight(phase, size);
      aircraft.visible = visible;
      // The wheels' bottom on the runway at y = 0.
      aircraft.position.set(0, size * 0.022 + size * 0.42 * 0.11 + y, z);
      aircraft.rotation.x = pitch;
      strobe.visible = t % 1 < 0.08;
      // The rabbit runs toward the runway twice a second.
      const lit = Math.floor((t * 10) % 5);
      approach.forEach((light, i) => (light.material.emissiveIntensity = i === lit ? 2 : 0.15));
    },
  };
}
