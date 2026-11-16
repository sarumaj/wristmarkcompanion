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

// A helicopter of `length` millimeters, nose toward -z: the cabin, the tail boom
// with its rotor, the skids, and the main rotor, whose blades fade into a disc as
// they speed up (a camera sees a blur, not blades).
function helicopterBody(length) {
  const paint = new THREE.MeshStandardMaterial({ color: 0xd62828, metalness: 0.2, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.4, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd3ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.7 });
  const craft = new THREE.Group();
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(length * 0.2, 24, 16), paint);
  cabin.scale.set(0.85, 0.8, 1.25);
  cabin.position.y = length * 0.2;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(length * 0.17, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.rotation.x = -Math.PI / 2 + 0.5;
  canopy.position.set(0, length * 0.22, -length * 0.1);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(length * 0.035, length * 0.06, length * 0.55, 12), paint);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, length * 0.24, length * 0.45);
  const fin = box(length * 0.02, length * 0.16, length * 0.1, paint, 0, length * 0.32, length * 0.7);
  const tailRotor = new THREE.Group();
  tailRotor.add(box(length * 0.01, length * 0.16, length * 0.025, dark));
  tailRotor.position.set(length * 0.03, length * 0.32, length * 0.72);
  const skids = [-1, 1].map((side) => {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(length * 0.012, length * 0.012, length * 0.6, 8), dark);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * length * 0.14, length * 0.012, length * 0.02);
    return skid;
  });
  const struts = [-1, 1].flatMap((side) =>
    [-0.12, 0.14].map((z) => box(length * 0.012, length * 0.1, length * 0.012, dark, side * length * 0.12, length * 0.06, z * length)),
  );
  const mast = box(length * 0.03, length * 0.08, length * 0.03, dark, 0, length * 0.4, 0);
  const rotor = new THREE.Group();
  const blades = new THREE.MeshStandardMaterial({ color: 0x1a1d23, roughness: 0.6, transparent: true });
  for (let i = 0; i < 4; i++) {
    const blade = box(length * 0.9, length * 0.006, length * 0.04, blades);
    blade.rotation.y = (i * Math.PI) / 4;
    rotor.add(blade);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(length * 0.45, 48),
    new THREE.MeshBasicMaterial({ color: 0x2a2f38, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  rotor.position.y = length * 0.45;
  const beacon = lamp(length * 0.02, 0xff3030);
  beacon.position.set(0, length * 0.38, length * 0.2);
  craft.add(cabin, canopy, boom, fin, tailRotor, ...skids, ...struts, mast, rotor, beacon);
  craft.add(disc);
  disc.position.y = length * 0.45;
  return { craft, rotor, tailRotor, blades, disc, beacon };
}

// A helipad on the watch and a helicopter on it, in a 16-second loop of the time
// alone: the rotor spins up, it lifts off, hovers turning once around and drifting a
// little, settles back onto the pad and spins down.
export function helicopter(size) {
  const pad = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.9 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc928, roughness: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.5, size * 0.5, size * 0.02, 48), concrete);
  base.position.y = size * 0.01;
  const circle = new THREE.Mesh(new THREE.TorusGeometry(size * 0.4, size * 0.012, 6, 64), yellow);
  circle.rotation.x = Math.PI / 2;
  circle.position.y = size * 0.021;
  // The H.
  const h = new THREE.Group();
  h.add(
    box(size * 0.05, size * 0.004, size * 0.32, paint, -size * 0.1, 0, 0),
    box(size * 0.05, size * 0.004, size * 0.32, paint, size * 0.1, 0, 0),
    box(size * 0.2, size * 0.004, size * 0.05, paint),
  );
  h.position.y = size * 0.022;
  pad.add(base, circle, h);
  const edge = Array.from({ length: 12 }, (_, i) => {
    const light = lamp(size * 0.014, 0x3fd06a);
    const angle = (i / 12) * Math.PI * 2;
    light.position.set(Math.cos(angle) * size * 0.47, size * 0.03, Math.sin(angle) * size * 0.47);
    pad.add(light);
    return light;
  });
  const { craft, rotor, tailRotor, blades, disc, beacon } = helicopterBody(size * 0.75);
  const { root } = standing(pad, craft);
  const ground = size * 0.02;
  return {
    object: root,
    animate: (t) => {
      const phase = t % 16;
      // The rotor's speed, 0 to 1: up in 3 s, down from 13 s.
      const speed = Math.min(1, phase / 3, Math.max(0, (16 - phase) / 3));
      // The height: lift-off at 3.5 s, settled at 12.5 s.
      const smooth = (k) => k * k * (3 - 2 * k);
      const lift = phase < 3.5 ? 0 : phase < 5.5 ? smooth((phase - 3.5) / 2) : phase < 10.5 ? 1 : phase < 12.5 ? smooth((12.5 - phase) / 2) : 0;
      const hovering = Math.max(0, Math.min(1, (phase - 5.5) / 5));
      craft.position.set(
        size * 0.06 * Math.sin(phase * 1.3) * lift,
        ground + size * 0.7 * lift + size * 0.02 * Math.sin(phase * 2.4) * lift,
        size * 0.05 * Math.cos(phase * 0.9) * lift,
      );
      craft.rotation.y = phase > 5.5 && phase < 10.5 ? smooth(hovering) * Math.PI * 2 : 0;
      craft.rotation.x = -0.06 * lift * Math.sin(phase * 1.3);
      rotor.rotation.y = -t * 40 * speed;
      tailRotor.rotation.x = t * 90 * speed;
      blades.opacity = 1 - 0.75 * speed;
      disc.material.opacity = 0.35 * speed;
      beacon.visible = t % 1 < 0.1;
      // The pad's lights chase around it while the helicopter is away.
      const lit = Math.floor(t * 8) % edge.length;
      edge.forEach((light, i) => (light.material.emissiveIntensity = lift > 0.05 && i !== lit ? 0.25 : 1.5));
    },
  };
}
