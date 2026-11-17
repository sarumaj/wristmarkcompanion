// Small worlds on the watch: a campfire, an aquarium and a lighthouse, each a loop of
// the time alone, from three.js's shapes.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { dot } from "./dot.js";

// A smooth, never-repeating-looking wobble from a few sines: -1 to 1.
const wobble = (t, seed) => (Math.sin(t * 7.1 + seed) + Math.sin(t * 11.3 + seed * 2.1) * 0.6 + Math.sin(t * 17.9 + seed * 3.7) * 0.3) / 1.9;

// Points that rise and fade in a loop, each from where `start(i)` puts it: embers,
// bubbles. Their places are functions of the time, so they need no state.
export function risers(count, { color, size, start, height, speed, blending = THREE.NormalBlending, opacity = 1 }) {
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), height);
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, map: dot(), transparent: true, opacity, depthWrite: false, blending }));
  return {
    points,
    update(t) {
      for (let i = 0; i < count; i++) {
        const life = (t * speed * (0.7 + ((i * 0.618) % 0.6)) + i / count) % 1;
        const [x, y, z] = start(i, life);
        positions.set([x + Math.sin(t * 2 + i) * height * 0.03 * life, y + life * height, z], i * 3);
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

// A campfire: a ring of stones, crossed logs, flames that flicker and lean, embers
// rising, and an orange light that flickers with them.
export function campfire(size) {
  const stones = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2;
    const rockRadius = size * (0.07 + 0.015 * (i % 3));
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rockRadius, 0), stone);
    // Flattened and resting on the watch, turned only about the vertical.
    rock.scale.y = 0.7;
    rock.position.set(Math.cos(angle) * size * 0.36, rockRadius * 0.7, Math.sin(angle) * size * 0.36);
    rock.rotation.y = i * 2;
    stones.add(rock);
  }
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 });
  const char = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 1, emissive: 0x3a0e00 });
  const logs = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.045, size * 0.05, size * 0.5, 10), i % 2 ? bark : char);
    log.rotation.z = Math.PI / 2 - 0.35;
    log.rotation.y = (i / 4) * Math.PI;
    // Leaning 20 degrees, a log reaches 0.13 marker sizes below its middle.
    log.position.y = size * 0.14;
    logs.add(log);
  }
  const flameColors = [0xffd34d, 0xff9a1f, 0xff5a1f];
  const flames = Array.from({ length: 7 }, (_, i) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(size * (0.09 - i * 0.006), size * (0.45 - i * 0.03), 12, 1, true),
      new THREE.MeshBasicMaterial({ color: flameColors[i % 3], transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    const angle = i * 2.4;
    flame.userData = { x: Math.cos(angle) * size * 0.06 * (i > 0), z: Math.sin(angle) * size * 0.06 * (i > 0), height: size * (0.45 - i * 0.03) };
    return flame;
  });
  const embers = risers(40, {
    color: 0xffb347, size: size * 0.03, height: size * 1.1, speed: 0.45, blending: THREE.AdditiveBlending,
    start: (i) => [Math.cos(i * 2.4) * size * 0.08, size * 0.2, Math.sin(i * 2.4) * size * 0.08],
  });
  const glow = new THREE.PointLight(0xff8a2a, 2, size * 3, 1.5);
  glow.position.y = size * 0.35;
  const { root } = standing(stones, logs, ...flames, embers.points, glow);
  // A shake of the wrist stirs the fire: taller flames and a burst of embers.
  let stirredAt = -Infinity;
  let clock = null;
  let emberClock = 0;
  return {
    object: root,
    gesture: (event) => {
      if (event.name !== "shake") return false;
      stirredAt = clock ?? 0;
      return true;
    },
    animate: (t) => {
      const burst = Math.exp(-(t - stirredAt) / 0.8);
      emberClock += (clock === null ? 0 : t - clock) * (1 + 3 * burst);
      clock = t;
      flames.forEach((flame, i) => {
        const flicker = (0.8 + 0.25 * wobble(t * 1.3, i)) * (1 + 0.6 * burst);
        flame.scale.set(1 + 0.1 * wobble(t, i + 5), flicker, 1 + 0.1 * wobble(t, i + 9));
        flame.position.set(flame.userData.x, size * 0.14 + (flame.userData.height * flicker) / 2, flame.userData.z);
        flame.rotation.z = 0.12 * wobble(t * 0.7, i + 3);
        flame.rotation.x = 0.12 * wobble(t * 0.6, i + 7);
      });
      glow.intensity = (1.6 + 0.6 * wobble(t * 1.5, 1)) * (1 + burst);
      embers.update(emberClock);
    },
  };
}

// A fish of `length`, nose toward +x: a body, a tail that wags, two eyes.
function fish(length, color) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(length * 0.35, 16, 12), skin);
  body.scale.set(1.4, 0.9, 0.55);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(length * 0.25, length * 0.35, 3), skin);
  tail.rotation.z = Math.PI / 2;
  tail.scale.z = 0.25;
  const tailPivot = new THREE.Group();
  tailPivot.position.x = -length * 0.42;
  tail.position.x = -length * 0.12;
  tailPivot.add(tail);
  const eye = new THREE.MeshStandardMaterial({ color: 0x101010 });
  for (const side of [-1, 1]) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(length * 0.05, 8, 6), eye);
    dot.position.set(length * 0.3, length * 0.06, side * length * 0.17);
    group.add(dot);
  }
  group.add(body, tailPivot);
  return { group, tailPivot };
}

// An aquarium: a glass bowl of water on the watch, sand and swaying plants, three fish
// swimming their rounds at different depths, and bubbles rising. A tap on the glass
// startles the fish: they dart off, four times as fast, and calm down in two seconds.
export function aquarium(size) {
  const radius = size * 0.5;
  const center = radius;
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, Math.PI * 0.18, Math.PI * 0.82),
    new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
  );
  glass.position.y = center;
  const water = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.97, 48, 24, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.72),
    new THREE.MeshStandardMaterial({ color: 0x3fa7d6, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }),
  );
  water.position.y = center;
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.5, size * 0.05, 32), new THREE.MeshStandardMaterial({ color: 0xe2c690, roughness: 1 }));
  sand.position.y = size * 0.08;
  const plants = [0, 1, 2, 3].map((i) => {
    const plant = new THREE.Mesh(new THREE.ConeGeometry(size * 0.035, size * (0.3 + 0.08 * (i % 2)), 6), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x2f9e44 : 0x5cbf3a, roughness: 0.8 }));
    const angle = i * 1.9 + 0.4;
    plant.position.set(Math.cos(angle) * radius * 0.4, size * 0.25, Math.sin(angle) * radius * 0.4);
    return plant;
  });
  const swimmers = [
    [0xff7a1a, 0.26, 0.32, 0.9, 0],
    [0xffd21f, 0.2, 0.18, -1.2, 2],
    [0x3d7bff, 0.18, 0.4, 0.7, 4],
  ].map(([color, length, ring, speed, phase]) => ({ ...fish(size * length, color), ring: radius * ring * 1.6, speed, phase }));
  const bubbles = risers(18, {
    color: 0xe8f8ff, size: size * 0.025, height: radius * 1.1, speed: 0.35, opacity: 0.8,
    start: (i) => [radius * 0.3 * Math.cos(i), size * 0.12, radius * 0.3 * Math.sin(i * 1.7)],
  });
  const { root } = standing(sand, ...plants, ...swimmers.map(({ group }) => group), bubbles.points, water, glass);
  // How far round each fish has swum: the speed changes when startled, so it adds up.
  let clock = null;
  let startled = -Infinity;
  for (const swimmer of swimmers) swimmer.angle = swimmer.phase;
  return {
    object: root,
    touch: () => {
      startled = clock ?? 0;
      return "Startled";
    },
    animate: (t) => {
      const dt = clock === null ? 0 : Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      const fright = Math.max(0, 1 - (t - startled) / 2);
      plants.forEach((plant, i) => (plant.rotation.z = 0.15 * Math.sin(t * 1.2 + i)));
      for (const swimmer of swimmers) {
        swimmer.angle += swimmer.speed * 0.5 * (1 + 3 * fright) * dt;
        const angle = swimmer.angle;
        swimmer.group.position.set(Math.cos(angle) * swimmer.ring, center + Math.sin(t * 0.7 + swimmer.phase) * radius * 0.25, Math.sin(angle) * swimmer.ring);
        // Facing along its circle: the tangent, which way round depends on the speed's sign.
        swimmer.group.rotation.y = -angle - Math.sign(swimmer.speed) * Math.PI / 2;
        swimmer.tailPivot.rotation.y = 0.5 * Math.sin(t * (9 + 18 * fright) + swimmer.phase);
      }
      bubbles.update(t);
    },
  };
}

// A lighthouse on a rock in the sea: a red and white tower, its lantern turning a
// beam round every six seconds, a lit window, and the water swaying around it.
export function lighthouse(size) {
  const sea = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.55, size * 0.03, 48), new THREE.MeshStandardMaterial({ color: 0x1d5f8a, roughness: 0.3, metalness: 0.2 }));
  sea.position.y = size * 0.015;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.22, 1), new THREE.MeshStandardMaterial({ color: 0x5b5a55, roughness: 1, flatShading: true }));
  rock.scale.set(1.2, 0.45, 1);
  // Resting on the watch: its half height, flattened.
  rock.position.y = size * 0.22 * 0.45;
  const tower = new THREE.Group();
  const stripes = 6;
  const height = size * 0.8;
  for (let i = 0; i < stripes; i++) {
    const bottom = 0.11 - (i / stripes) * 0.04;
    const top = 0.11 - ((i + 1) / stripes) * 0.04;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(size * top, size * bottom, height / stripes, 24),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf2f2f2 : 0xd62828, roughness: 0.6 }),
    );
    band.position.y = size * 0.12 + (i + 0.5) * (height / stripes);
    tower.add(band);
  }
  const deck = size * 0.12 + height;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.1, size * 0.1, size * 0.02, 24), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  gallery.position.y = deck;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.055, size * 0.055, size * 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffe066, emissiveIntensity: 1.2 }));
  lantern.position.y = deck + size * 0.06;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(size * 0.08, size * 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  cap.position.y = deck + size * 0.15;
  // The beam: a long, faint cone from the lantern, pointing out sideways, turning.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.18, size * 1.2, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.x = size * 0.6;
  const turn = new THREE.Group();
  turn.add(beam);
  turn.position.y = deck + size * 0.06;
  const lit = new THREE.Mesh(new THREE.BoxGeometry(size * 0.03, size * 0.05, size * 0.01), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb347, emissiveIntensity: 1 }));
  lit.position.set(0, size * 0.45, size * 0.094);
  const { root } = standing(sea, rock, tower, gallery, lantern, cap, turn, lit);
  return {
    object: root,
    animate: (t) => {
      turn.rotation.y = (t / 6) * Math.PI * 2;
      sea.position.y = size * (0.015 + 0.004 * Math.sin(t * 1.4));
      sea.rotation.z = 0.01 * Math.sin(t * 0.9);
    },
  };
}
