// Creatures on the watch: a Tyrannosaurus rex stomping among ferns, and Glimmer, a small
// creature of this project's own with a glowing crystal on its tail. Loops of the time
// alone, from three.js's shapes; a tap makes the rex roar and Glimmer sparkle.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { dot } from "./dot.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...options });

function at(object, x = 0, y = 0, z = 0) {
  object.position.set(x, y, z);
  return object;
}

function ellipsoid(radius, [sx, sy, sz], color, x = 0, y = 0, z = 0) {
  const mesh = at(new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), color), x, y, z);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

// The same numbers every run (the pictures are rendered from the models): 0 to 1 from i.
const random = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// A Tyrannosaurus rex side on (its head toward +x), on a patch of moss with ferns: it shifts
// from foot to foot, its tail swaying, looks about and blinks. A tap, or every ten seconds:
// it rears its head and roars, jaws wide, its tiny arms waving.
export function tRex(size) {
  const s = size / 20;
  const skin = material(0x4f7a3a, { flatShading: true });
  const belly = material(0xb7c47a);
  const dark = material(0x1c1f17);
  const ivory = material(0xf2ecd8, { roughness: 0.4 });
  const moss = at(new THREE.Mesh(new THREE.CylinderGeometry(12 * s, 12.5 * s, 0.8 * s, 40), material(0x5e7d34)), 0, 0.4 * s, 0);
  const ferns = Array.from({ length: 7 }, (_, i) => {
    const angle = 0.4 + i * 0.9;
    const fern = at(new THREE.Mesh(new THREE.ConeGeometry(1.2 * s, 3.2 * s, 5), material(0x2f6b2a, { flatShading: true })), Math.cos(angle) * 10 * s, 2.2 * s, Math.sin(angle) * 9 * s);
    fern.rotation.z = (random(i) - 0.5) * 0.6;
    return fern;
  });

  // Everything above the legs moves together: the body bobs as it shifts its weight.
  const torso = at(new THREE.Group(), 0, 10 * s, 0);
  const body = ellipsoid(4 * s, [1.7, 1.05, 0.95], skin);
  body.rotation.z = 0.28;
  torso.add(body, ellipsoid(3.3 * s, [1.5, 0.8, 0.75], belly, 1 * s, -1.2 * s, 0));
  // The tail: four segments, each hung from the one before, so a sway runs down it.
  const tail = [];
  let parent = torso;
  [[-5.5, -0.8, 3], [-3.6, -0.7, 2.2], [-3, -0.5, 1.5], [-2.4, -0.3, 0.9]].forEach(([dx, dy, radius]) => {
    const joint = at(new THREE.Group(), dx * s, dy * s, 0);
    joint.add(ellipsoid(radius * s, [1.6, 0.9, 0.9], skin));
    parent.add(joint);
    tail.push(joint);
    parent = joint;
  });
  // The tiny arms on the chest.
  const arms = [-1, 1].map((side) => {
    const pivot = at(new THREE.Group(), 4.6 * s, -1 * s, side * 2.3 * s);
    const arm = at(new THREE.Mesh(new THREE.CapsuleGeometry(0.4 * s, 1.6 * s, 4, 8), skin), 0.4 * s, -0.9 * s, 0);
    arm.rotation.z = 0.6;
    pivot.add(arm);
    torso.add(pivot);
    return pivot;
  });
  // The neck and the head, the lower jaw hinged at the back of it.
  const neck = at(new THREE.Group(), 5.6 * s, 2.4 * s, 0);
  neck.add(ellipsoid(2.3 * s, [1.1, 1.2, 0.9], skin));
  const head = at(new THREE.Group(), 1.6 * s, 1.6 * s, 0);
  head.scale.setScalar(1.3);
  const skull = at(new THREE.Mesh(new THREE.BoxGeometry(5.6 * s, 2.4 * s, 3 * s), skin), 2 * s, 0.4 * s, 0);
  const snout = at(new THREE.Mesh(new THREE.BoxGeometry(2.4 * s, 1.6 * s, 2.4 * s), skin), 4.8 * s, 0.2 * s, 0);
  const jaw = at(new THREE.Group(), -0.4 * s, -0.8 * s, 0);
  jaw.add(at(new THREE.Mesh(new THREE.BoxGeometry(5.6 * s, 0.9 * s, 2.6 * s), skin), 2.8 * s, -0.4 * s, 0));
  const teeth = [];
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const upper = at(new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 0.7 * s, 5), ivory), (1 + i * 0.85) * s, -0.95 * s, side * 1.1 * s);
      upper.rotation.x = Math.PI;
      const lower = at(new THREE.Mesh(new THREE.ConeGeometry(0.2 * s, 0.6 * s, 5), ivory), (1.4 + i * 0.75) * s, 0.3 * s, side * 1.05 * s);
      teeth.push(upper);
      jaw.add(lower);
    }
  }
  const eyes = [-1, 1].map((side) => {
    const eye = at(new THREE.Group(), 1.6 * s, 1.1 * s, side * 1.5 * s);
    eye.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 12, 8), material(0xf5c542, { roughness: 0.3 }))));
    eye.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 10, 8), dark), 0.15 * s, 0, side * 0.3 * s));
    return eye;
  });
  const brows = [-1, 1].map((side) => at(new THREE.Mesh(new THREE.BoxGeometry(1.6 * s, 0.4 * s, 0.6 * s), skin), 1.6 * s, 1.7 * s, side * 1.3 * s));
  head.add(skull, snout, jaw, ...teeth, ...eyes, ...brows);
  neck.add(head);
  torso.add(neck);

  // The legs: a big thigh, a shin down to a three-toed foot.
  const legs = [-1, 1].map((side) => {
    const hip = at(new THREE.Group(), 0.3 * s, 9 * s, side * 2.6 * s);
    hip.add(ellipsoid(2.6 * s, [1.1, 1.4, 0.8], skin, 0.3 * s, -1 * s, 0));
    const shin = at(new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 0.7 * s, 5.2 * s, 10), skin), -0.2 * s, -5.4 * s, 0);
    shin.rotation.z = -0.15;
    const foot = at(new THREE.Group(), 0.6 * s, -8.2 * s, 0);
    foot.add(at(new THREE.Mesh(new THREE.BoxGeometry(3 * s, 0.8 * s, 1.8 * s), skin), 0.6 * s, 0, 0));
    for (const toe of [-0.6, 0, 0.6]) {
      const claw = at(new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 0.8 * s, 5), ivory), 2.3 * s, -0.1 * s, toe * s);
      claw.rotation.z = -Math.PI / 2;
      foot.add(claw);
    }
    hip.add(shin, foot);
    return { hip, foot, side };
  });

  const { root } = standing(moss, ...ferns, torso, ...legs.map(({ hip }) => hip));
  let clock = 0;
  let roaredAt = -Infinity;
  return {
    object: root,
    touch: () => {
      if (clock - roaredAt < 1.6) return null;
      roaredAt = clock;
      return "Roar!";
    },
    animate: (t) => {
      clock = t;
      // By itself every ten seconds, at 6 s past.
      const due = Math.floor((t - 6) / 10) * 10 + 6;
      if (due >= 0 && due > roaredAt + 1.6 && t - due < 1.6) roaredAt = due;
      const roar = t - roaredAt;
      // 0 to 1 and back over the roar's 1.6 seconds.
      const loud = roar < 1.6 ? Math.sin((roar / 1.6) * Math.PI) : 0;
      // Foot to foot: the foot not carrying the weight lifts a little.
      const step = Math.sin(t * 1.8);
      for (const { hip, foot, side } of legs) {
        const lift = Math.max(0, step * side);
        foot.position.y = (-8.2 + lift * 0.8) * s;
        hip.rotation.z = lift * 0.12;
      }
      torso.position.y = (10 + 0.25 * Math.abs(step)) * s;
      torso.rotation.x = step * 0.04;
      tail.forEach((joint, i) => {
        joint.rotation.y = Math.sin(t * 1.8 - i * 0.6) * 0.18;
        joint.rotation.z = 0.05 + loud * 0.08;
      });
      // Looking about, then rearing up with its jaws wide for the roar.
      neck.rotation.y = (1 - loud) * Math.sin(t * 0.5) * 0.45 + loud * 0.35;
      neck.rotation.z = loud * 0.45 + 0.05 * Math.sin(t * 0.9);
      head.rotation.x = loud ? loud * 0.12 * Math.sin(roar * 40) : 0;
      jaw.rotation.z = -0.08 - loud * 0.65;
      for (const arm of arms) arm.rotation.z = -0.2 + (loud ? loud * 0.6 * Math.sin(roar * 18) : 0);
      const blink = t % 5 < 0.12 ? 0.15 : 1;
      for (const eye of eyes) eye.scale.y = blink;
    },
  };
}

// Glimmer: a small, round creature of this project's own, lilac with a pale belly, long ears
// tipped with light, big eyes and a curled tail ending in a glowing crystal. It bounces on
// the spot, twitches its ears, blinks and looks at you. A tap: a hop, a spin and a burst of
// sparkles from its crystal.
export function critter(size) {
  const s = size / 20;
  const fur = material(0x9a86e8, { roughness: 0.85 });
  const pale = material(0xf1ebff, { roughness: 0.85 });
  const dark = material(0x1f1736, { roughness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x8ff7ff, emissive: 0x35e0ff, emissiveIntensity: 1.2, roughness: 0.2, flatShading: true });
  const grass = at(new THREE.Mesh(new THREE.CylinderGeometry(8 * s, 8.5 * s, 0.8 * s, 32), material(0x6bb35a)), 0, 0.4 * s, 0);
  const flowers = Array.from({ length: 6 }, (_, i) => {
    const angle = i * 1.1 + 0.3;
    return at(new THREE.Mesh(new THREE.SphereGeometry(0.45 * s, 8, 6), material([0xffd6e8, 0xfff3b0, 0xffffff][i % 3])), Math.cos(angle) * 6.5 * s, 1 * s, Math.sin(angle) * 6.5 * s);
  });

  // Its body bounces; all of it is in `creature`, turned toward the viewer (+z).
  const creature = at(new THREE.Group(), 0, 0.8 * s, 0);
  const body = ellipsoid(4.2 * s, [1, 0.92, 0.95], fur, 0, 4.4 * s, 0);
  const tummy = ellipsoid(3 * s, [0.85, 0.9, 0.45], pale, 0, 3.9 * s, 2.9 * s);
  const feet = [-1, 1].map((side) => ellipsoid(1.1 * s, [1, 0.5, 1.4], fur, side * 2 * s, 0.5 * s, 1.2 * s));
  const paws = [-1, 1].map((side) => ellipsoid(0.8 * s, [1, 1, 1], pale, side * 2.6 * s, 4.4 * s, 3 * s));
  // Ears: long, leaning out, each with a glowing tip; they twitch now and then.
  const ears = [-1, 1].map((side) => {
    const pivot = at(new THREE.Group(), side * 1.8 * s, 7.6 * s, 0);
    pivot.rotation.z = -side * 0.35;
    pivot.add(ellipsoid(0.9 * s, [1, 3.6, 0.6], fur, 0, 2.8 * s, 0));
    pivot.add(ellipsoid(0.55 * s, [1, 2.4, 0.5], pale, 0, 2.6 * s, 0.35 * s));
    pivot.add(at(new THREE.Mesh(new THREE.OctahedronGeometry(0.7 * s), glow), 0, 6.3 * s, 0));
    return { pivot, side };
  });
  // Big eyes: dark, with a highlight each.
  const eyes = [-1, 1].map((side) => {
    const eye = at(new THREE.Group(), side * 1.5 * s, 5.4 * s, 3.5 * s);
    eye.add(ellipsoid(0.85 * s, [0.85, 1.15, 0.5], dark));
    eye.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 8, 6), pale), side * 0.2 * s, 0.35 * s, 0.4 * s));
    return eye;
  });
  const nose = ellipsoid(0.3 * s, [1.3, 0.8, 0.8], dark, 0, 4.6 * s, 4 * s);
  // The tail: a curl of shrinking balls behind it, up to the crystal.
  const tail = new THREE.Group();
  const tip = new THREE.Vector3();
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const angle = k * Math.PI * 1.1;
    tip.set(0, 2.5 * s + Math.sin(angle) * 4 * s, -3.6 * s - (1 - Math.cos(angle)) * 2.4 * s + k * 1.5 * s);
    tail.add(at(new THREE.Mesh(new THREE.SphereGeometry((0.9 - 0.45 * k) * s, 12, 8), fur), tip.x, tip.y, tip.z));
  }
  const crystal = at(new THREE.Mesh(new THREE.OctahedronGeometry(1.2 * s), glow), tip.x, tip.y + 1.4 * s, tip.z);
  crystal.scale.y = 1.6;
  tail.add(crystal);
  const light = at(new THREE.PointLight(0x5ce8ff, 0.8, size * 1.5, 1.5), tip.x, tip.y + 1.4 * s, tip.z);
  tail.add(light);
  creature.add(body, tummy, ...feet, ...paws, ...ears.map(({ pivot }) => pivot), ...eyes, nose, tail);

  // Sparkles from the crystal after a tap: each flies out along its own direction and falls.
  const count = 40;
  const sparks = Array.from({ length: count }, (_, i) => {
    const angle = random(i) * Math.PI * 2;
    const rise = 0.3 + 0.7 * random(i + 50);
    return new THREE.Vector3(Math.cos(angle) * (1 - rise * 0.5), rise, Math.sin(angle) * (1 - rise * 0.5)).multiplyScalar(6 * s * (0.6 + 0.4 * random(i + 90)));
  });
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8 * s, 0), 10 * s);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-8 * s, 0, -8 * s), new THREE.Vector3(8 * s, 16 * s, 8 * s));
  const sparkles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xbff9ff, size: size * 0.07, map: dot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparkles.visible = false;
  const origin = new THREE.Vector3();

  const { root } = standing(grass, ...flowers, creature, sparkles);
  let clock = 0;
  let tappedAt = -Infinity;
  return {
    object: root,
    touch: () => {
      if (clock - tappedAt < 1.2) return null;
      tappedAt = clock;
      return "Sparkle!";
    },
    animate: (t) => {
      clock = t;
      const since = t - tappedAt;
      const hop = since < 0.7 ? Math.sin((since / 0.7) * Math.PI) : 0;
      // A little bounce, squashing as it lands; a hop and a spin after a tap.
      const bounce = Math.abs(Math.sin(t * 2.6));
      creature.position.y = (0.8 + bounce * 0.6 + hop * 4) * s;
      creature.scale.set(1 + (1 - bounce) * 0.04, 1 - (1 - bounce) * 0.05, 1);
      creature.rotation.y = since < 0.7 ? (since / 0.7) * Math.PI * 2 : Math.sin(t * 0.6) * 0.25;
      for (const { pivot, side } of ears) {
        const twitch = (t + side * 0.4) % 3 < 0.25 ? Math.sin(t * 40) * 0.15 : 0;
        pivot.rotation.z = -side * (0.35 + 0.08 * Math.sin(t * 2.6)) + twitch;
      }
      const blink = t % 3.5 < 0.12 ? 0.12 : 1;
      for (const eye of eyes) eye.scale.y = blink;
      tail.rotation.y = Math.sin(t * 1.8) * 0.25;
      glow.emissiveIntensity = 1 + 0.4 * Math.sin(t * 3) + (since < 1.5 ? 1.5 * (1 - since / 1.5) : 0);
      light.intensity = 0.6 + 0.3 * Math.sin(t * 3) + (since < 1.5 ? 2 * (1 - since / 1.5) : 0);
      sparkles.visible = since < 1.5;
      if (sparkles.visible) {
        // The crystal where it is now, in the frame the sparkles share with the creature.
        tail.updateMatrix();
        creature.updateMatrix();
        origin.copy(crystal.position).applyMatrix4(tail.matrix).applyMatrix4(creature.matrix);
        sparks.forEach((spark, i) => {
          const k = since / 1.5;
          positions[i * 3] = origin.x + spark.x * k;
          positions[i * 3 + 1] = origin.y + spark.y * k - 9 * s * k * k;
          positions[i * 3 + 2] = origin.z + spark.z * k;
        });
        geometry.attributes.position.needsUpdate = true;
      }
    },
  };
}
