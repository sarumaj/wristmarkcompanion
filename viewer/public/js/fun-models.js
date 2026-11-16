// Playful models, from three.js's shapes: a robot mascot and a snow globe. Their
// animations are loops of the time alone; reacting to the wrist's movements comes
// with the interaction (docs/interaction.md).
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";

function part(geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

// A small robot standing on the watch: it bobs, looks around, blinks, and waves now
// and then, its antenna light pulsing.
export function robot(size) {
  const s = size / 20;
  const shell = new THREE.MeshStandardMaterial({ color: 0xe8edf2, metalness: 0.2, roughness: 0.45 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0055aa, metalness: 0.1, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x33c8ff, emissiveIntensity: 1 });

  const feet = [-1, 1].map((side) => part(new THREE.BoxGeometry(3.2 * s, 1.4 * s, 4 * s), trim, side * 2.6 * s, 0.7 * s, 0.4 * s));
  const legs = [-1, 1].map((side) => part(new THREE.CylinderGeometry(0.8 * s, 0.8 * s, 2.6 * s, 12), dark, side * 2.6 * s, 2.6 * s, 0));
  const body = new THREE.Group();
  body.add(
    part(new THREE.BoxGeometry(9 * s, 8 * s, 6 * s), shell, 0, 4 * s, 0),
    part(new THREE.BoxGeometry(5 * s, 3 * s, 0.4 * s), trim, 0, 4.5 * s, 3.1 * s),
  );
  body.position.y = 3.6 * s;

  // An arm hangs from its shoulder pivot; the right one waves.
  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 5.2 * s, 10.6 * s, 0);
    pivot.add(
      part(new THREE.CylinderGeometry(0.7 * s, 0.7 * s, 5 * s, 12), dark, 0, -2.5 * s, 0),
      part(new THREE.SphereGeometry(1.1 * s, 12, 8), trim, 0, -5.4 * s, 0),
    );
    return pivot;
  };
  const left = arm(-1);
  const right = arm(1);

  const head = new THREE.Group();
  const eyes = [-1, 1].map((side) => part(new THREE.SphereGeometry(0.9 * s, 16, 8), glow, side * 1.8 * s, 0.4 * s, 3.05 * s));
  const light = part(new THREE.SphereGeometry(0.8 * s, 12, 8), glow.clone(), 0, 5.4 * s, 0);
  head.add(
    part(new THREE.BoxGeometry(7 * s, 5.4 * s, 6 * s), shell),
    part(new THREE.BoxGeometry(5.6 * s, 3 * s, 0.3 * s), dark, 0, 0.3 * s, 3 * s),
    part(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 2.4 * s, 8), dark, 0, 3.9 * s, 0),
    light,
    ...eyes,
  );
  head.position.y = 15.4 * s;

  const figure = new THREE.Group();
  figure.add(...feet, ...legs, body, left, right, head);
  const { root } = standing(figure);
  return {
    object: root,
    animate: (t) => {
      const bob = Math.abs(Math.sin(t * 2.2)) * 0.5 * s;
      body.position.y = 3.6 * s + bob;
      head.position.y = 15.4 * s + bob * 1.3;
      left.position.y = right.position.y = 10.6 * s + bob;
      head.rotation.y = 0.5 * Math.sin(t * 0.7);
      // Blink for a tenth of a second every 3.5 seconds.
      const blink = t % 3.5 < 0.1 ? 0.15 : 1;
      for (const eye of eyes) eye.scale.y = blink;
      // Wave for 2 of every 6 seconds: the arm up, the forearm swinging.
      const phase = t % 6;
      const waving = phase < 2 ? Math.sin((phase / 2) * Math.PI) : 0;
      right.rotation.z = waving * (2.6 + 0.35 * Math.sin(t * 12));
      left.rotation.z = -0.08 - 0.05 * Math.sin(t * 2.2);
      light.material.emissiveIntensity = 0.6 + 0.6 * Math.abs(Math.sin(t * 3));
    },
  };
}

// A snow globe on the watch: a fir tree in a glass dome, the snow drifting down
// and around, endlessly.
export function snowglobe(size) {
  const radius = size * 0.45;
  const base = new THREE.Group();
  base.add(
    part(new THREE.CylinderGeometry(radius * 0.95, radius * 1.05, size * 0.18, 48),
      new THREE.MeshStandardMaterial({ color: 0x7a3e1d, roughness: 0.7 }), 0, size * 0.09, 0),
    part(new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, size * 0.02, 48),
      new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.9 }), 0, size * 0.19, 0),
  );
  const center = size * 0.18 + radius * 0.82;
  const needles = new THREE.MeshStandardMaterial({ color: 0x1f6f43, roughness: 0.8, flatShading: true });
  const tree = new THREE.Group();
  tree.add(part(new THREE.CylinderGeometry(size * 0.025, size * 0.03, size * 0.08, 8),
    new THREE.MeshStandardMaterial({ color: 0x5b3a1e }), 0, size * 0.04, 0));
  [0.32, 0.25, 0.17].forEach((width, i) => {
    tree.add(part(new THREE.ConeGeometry(size * width * 0.5, size * 0.2, 10), needles, 0, size * (0.15 + i * 0.11), 0));
  });
  tree.add(part(new THREE.OctahedronGeometry(size * 0.03),
    new THREE.MeshStandardMaterial({ color: 0xffd200, emissive: 0xffaa00, emissiveIntensity: 0.8 }), 0, size * 0.47, 0));
  tree.position.y = size * 0.2;
  const glass = part(new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.82),
    new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    0, center, 0);

  // The flakes: each has a column (angle, radius), a speed and a start, so its place
  // is a function of the time; they fall from the dome's top to the ground and start
  // again, drifting round the tree.
  const count = 160;
  const flakes = Array.from({ length: count }, (_, i) => ({
    angle: (i * 2.399963) % (Math.PI * 2),
    radius: radius * 0.75 * Math.sqrt(((i * 0.618034) % 1) * 0.9 + 0.1),
    speed: 0.08 + ((i * 0.3819) % 1) * 0.08,
    start: (i * 0.7548) % 1,
  }));
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const top = center + radius * 0.75;
  const ground = size * 0.2;
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-radius, ground, -radius), new THREE.Vector3(radius, top, radius));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, center, 0), radius);
  const snow = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: size * 0.025 }));

  const { root } = standing(base, tree, snow, glass);
  return {
    object: root,
    animate: (t) => {
      flakes.forEach((flake, i) => {
        const fall = (flake.start + t * flake.speed) % 1;
        // Narrower toward the dome's top, where the glass curves in.
        const height = top - fall * (top - ground);
        const room = Math.sqrt(Math.max(0, 1 - ((height - center) / radius) ** 2));
        const angle = flake.angle + t * 0.3 + Math.sin(t + i) * 0.2;
        positions[i * 3] = Math.cos(angle) * flake.radius * room;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = Math.sin(angle) * flake.radius * room;
      });
      geometry.attributes.position.needsUpdate = true;
    },
  };
}
