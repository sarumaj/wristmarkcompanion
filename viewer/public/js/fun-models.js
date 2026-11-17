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
  // A flick of the wrist makes it wave at once.
  let wavedAt = -Infinity;
  let clock = 0;
  return {
    object: root,
    gesture: (event) => {
      if (event.name !== "flick") return false;
      wavedAt = clock;
      return true;
    },
    animate: (t) => {
      clock = t;
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
      const asked = t - wavedAt;
      const waving = Math.max(phase < 2 ? Math.sin((phase / 2) * Math.PI) : 0, asked < 2 ? Math.sin((asked / 2) * Math.PI) : 0);
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
  // A shake (or a flick) stirs the snow up; it settles over a few seconds.
  let stirredAt = -Infinity;
  let clock = 0;
  return {
    object: root,
    gesture: (event) => {
      if (event.name !== "shake" && event.name !== "flick") return false;
      stirredAt = clock;
      return true;
    },
    animate: (t) => {
      clock = t;
      const stir = Math.exp(-(t - stirredAt) / 1.5);
      flakes.forEach((flake, i) => {
        const fall = (flake.start + t * flake.speed) % 1;
        // Narrower toward the dome's top, where the glass curves in; stirred, up again.
        const settled = top - fall * (top - ground);
        const height = Math.min(top, settled + stir * (top - ground) * 0.7 * Math.abs(Math.sin(t * 2.3 + i)));
        const room = Math.sqrt(Math.max(0, 1 - ((height - center) / radius) ** 2));
        const angle = flake.angle + t * 0.3 + Math.sin(t + i) * 0.2 + stir * 3 * Math.sin(t * 1.7 + i * 0.5);
        positions[i * 3] = Math.cos(angle) * flake.radius * room;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = Math.sin(angle) * flake.radius * room;
      });
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

// Fireworks rising from the watch: rockets launched one after another, each
// bursting into a ball of sparks that fall and fade. Every spark's place is a
// function of the time, so the show loops without keeping state.
export function fireworks(size) {
  const rockets = 5;
  const sparks = 70;
  const period = 5;
  const colors = [0xff4d4d, 0xffd24d, 0x4dd2ff, 0x9dff4d, 0xff4dff].map((hex) => new THREE.Color(hex));
  const count = rockets * (sparks + 1);
  const positions = new Float32Array(count * 3);
  const shades = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(shades, 3));
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-size, 0, -size), new THREE.Vector3(size, size * 2.2, size));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, size, 0), size * 1.6);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: size * 0.07, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  // The sparks' directions, spread evenly over a sphere (a Fibonacci lattice).
  const directions = Array.from({ length: sparks }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / sparks;
    const r = Math.sqrt(1 - y * y);
    const angle = i * 2.399963;
    return [Math.cos(angle) * r, y, Math.sin(angle) * r];
  });
  const launcher = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.06, size * 0.08, size * 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0x5a2d82, roughness: 0.6 }),
  );
  launcher.position.y = size * 0.04;
  const { root } = standing(launcher, points);
  const put = (index, x, y, z, color, brightness) => {
    positions.set([x, Math.max(y, 0), z], index * 3);
    shades.set([color.r * brightness, color.g * brightness, color.b * brightness], index * 3);
  };
  // A flick or a shake launches the rocket that has been waiting longest, at once.
  const shift = new Array(rockets).fill(0);
  let clock = 0;
  const age = (r, t) => (((t + (r * period) / rockets + shift[r]) % period) + period) % period;
  return {
    object: root,
    gesture: (event) => {
      if (event.name !== "flick" && event.name !== "shake") return false;
      const oldest = shift.map((_, r) => r).reduce((a, b) => (age(a, clock) >= age(b, clock) ? a : b));
      shift[oldest] -= age(oldest, clock);
      return true;
    },
    animate: (t) => {
      clock = t;
      for (let r = 0; r < rockets; r++) {
        const elapsed = age(r, t);
        const round = Math.floor((t + (r * period) / rockets + shift[r]) / period);
        // Each round of a rocket gets its own place, height and color.
        const seed = (r * 7 + round * 13) % 17;
        const color = colors[(r + round) % colors.length];
        const top = size * (1.2 + 0.05 * (seed % 7));
        const x = size * 0.35 * Math.sin(seed * 1.7);
        const z = size * 0.35 * Math.cos(seed * 2.3);
        const base = r * (sparks + 1);
        const rise = 1.0;
        if (elapsed < rise) {
          // The rocket climbing, slowing toward the top; no sparks yet.
          const k = elapsed / rise;
          put(base, x * k, top * (2 * k - k * k), z * k, new THREE.Color(0xffe0a0), 1);
          for (let s = 1; s <= sparks; s++) put(base + s, 0, 0, 0, color, 0);
          continue;
        }
        put(base, 0, 0, 0, color, 0);
        const since = elapsed - rise;
        const spread = size * 0.55 * (1 - Math.exp(-since * 3));
        const fall = size * 0.12 * since * since;
        const fade = Math.max(0, 1 - since / 2.2);
        directions.forEach(([dx, dy, dz], s) => {
          put(base + s + 1, x + dx * spread, top + dy * spread - fall, z + dz * spread, color, fade ** 1.5);
        });
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}

// A die's face: `pips` dots on ivory, drawn on a canvas.
function dieFace(pips) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f7f3ea";
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = pips === 1 ? "#c8102e" : "#1b1f24";
  const at = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]],
    5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]] }[pips];
  for (const [col, row] of at) {
    context.beginPath();
    context.arc(col * 32, row * 32, pips === 1 ? 16 : 12, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35 });
}

// BoxGeometry's faces are +x, -x, +y, -y, +z, -z; opposite faces add up to 7. The
// turn that brings each value's face up (+y).
const DIE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_UP = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0] };

// Two dice thrown onto the watch every five seconds: they tumble in, bounce and settle
// on a new roll, which stays a while. The rolls follow from the time, so they look
// random but need no state (a flick of the wrist will throw them, docs/interaction.md).
export function dice(size) {
  const side = size * 0.28;
  const faces = DIE_VALUES.map(dieFace);
  const pair = [-1, 1].map((sideOf) => {
    const turn = new THREE.Group();
    const die = new THREE.Mesh(new THREE.BoxGeometry(side, side, side), faces);
    turn.add(die);
    return { sideOf, turn, die };
  });
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.55, size * 0.02, 48), new THREE.MeshStandardMaterial({ color: 0x0f5c3a, roughness: 0.95 }));
  felt.position.y = size * 0.01;
  const { root } = standing(felt, ...pair.map(({ turn }) => turn));
  const period = 5;
  const roll = (round, which) => 1 + Math.floor(((Math.sin(round * 12.9898 + which * 78.233) * 43758.5453) % 1 + 1) % 1 * 6);
  // A throw every `period` seconds, or at once on a flick or a shake of the wrist.
  let thrownAt = null;
  let throws = 0;
  let clock = 0;
  return {
    object: root,
    gesture: (event) => {
      if (event.name !== "flick" && event.name !== "shake") return false;
      thrownAt = clock;
      throws++;
      return true;
    },
    animate: (t) => {
      clock = t;
      if (thrownAt === null) {
        // Settled from the start.
        thrownAt = t - 1.4;
      } else if (t - thrownAt >= period) {
        thrownAt = t;
        throws++;
      }
      const round = throws;
      const k = Math.min(1, (t - thrownAt) / 1.4);
      const ease = 1 - (1 - k) ** 3;
      pair.forEach(({ sideOf, turn, die }, which) => {
        const value = roll(round, which);
        const [x, y, z] = FACE_UP[value];
        const spin = (1 - ease) * 9;
        die.rotation.set(x + spin * (1.3 + which), y + spin, z + spin * 0.7);
        turn.rotation.y = (round * 1.7 + which) % (Math.PI * 2);
        const bounce = Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * size * 0.35;
        turn.position.set(sideOf * size * (0.2 + 0.4 * (1 - ease)), size * 0.02 + side / 2 + size * 0.9 * (1 - ease) ** 2 + bounce, -size * 0.3 * (1 - ease) + sideOf * size * 0.05);
      });
    },
  };
}
