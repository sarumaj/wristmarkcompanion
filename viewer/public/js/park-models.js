// Out in the park: a straw bee hive in a meadow, its bees flying out to the flowers and back,
// and a skate park, a skater riding its half-pipe. Loops of the time alone, from three.js's
// shapes; a tap brings the swarm out, or a kickflip.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...options });

function at(object, x = 0, y = 0, z = 0) {
  object.position.set(x, y, z);
  return object;
}

// The same numbers every run (the pictures are rendered from the models): 0 to 1 from i.
const random = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// A bee facing +z: a striped body, two wings that beat.
function bee(s, materials) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35 * s, 12, 8), materials.yellow);
  body.scale.set(0.9, 0.9, 1.4);
  group.add(body);
  for (const z of [-0.15, 0.12]) {
    const stripe = at(new THREE.Mesh(new THREE.CylinderGeometry(0.33 * s, 0.33 * s, 0.12 * s, 12), materials.black), 0, 0, z * s);
    stripe.rotation.x = Math.PI / 2;
    group.add(stripe);
  }
  group.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 10, 8), materials.black), 0, 0, 0.5 * s));
  const wings = [-1, 1].map((side) => {
    const pivot = at(new THREE.Group(), side * 0.15 * s, 0.25 * s, 0);
    const wing = at(new THREE.Mesh(new THREE.CircleGeometry(0.35 * s, 10), materials.wing), side * 0.35 * s, 0, 0);
    wing.rotation.x = -Math.PI / 2;
    wing.scale.set(1, 0.6, 1);
    pivot.add(wing);
    group.add(pivot);
    return { pivot, side };
  });
  return { group, wings };
}

// A bee hive: a straw skep on a wooden stand in a meadow of flowers. Bees fly out to the
// flowers, hover there and come back, each on its own round. A tap: the swarm pours out
// and circles the hive for a few seconds.
export function beehive(size) {
  const s = size / 20;
  const meadow = at(new THREE.Mesh(new THREE.CylinderGeometry(11 * s, 11.5 * s, 0.8 * s, 40), material(0x6aa84f)), 0, 0.4 * s, 0);
  const wood = material(0x8b5a2b);
  const stand = new THREE.Group();
  stand.add(at(new THREE.Mesh(new THREE.BoxGeometry(8 * s, 0.6 * s, 8 * s), wood), 0, 2.5 * s, 0));
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    stand.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.7 * s, 2.2 * s, 0.7 * s), wood), x * s, 1.5 * s, z * s));
  }
  // The skep: coils of straw, each narrower than the one below, on a dome that fills them.
  const base = 2.8 * s;
  const height = 6 * s;
  const straw = [material(0xd9a441), material(0xc48f2f)];
  const skep = new THREE.Group();
  const outline = Array.from({ length: 13 }, (_, i) => {
    const k = i / 12;
    return new THREE.Vector2(3.7 * s * Math.sqrt(Math.max(0, 1 - k ** 2.2)), k * height);
  });
  skep.add(at(new THREE.Mesh(new THREE.LatheGeometry(outline, 32), straw[1]), 0, base, 0));
  const coils = 9;
  for (let i = 0; i < coils; i++) {
    const k = (i + 0.5) / coils;
    const radius = 3.7 * s * Math.sqrt(Math.max(0, 1 - k ** 2.2));
    const coil = at(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.42 * s, 8, 32), straw[i % 2]), 0, base + k * height, 0);
    coil.rotation.x = Math.PI / 2;
    skep.add(coil);
  }
  skep.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.6 * s, 12, 8), straw[0]), 0, base + height, 0));
  // The entrance: a dark arch at the bottom, at the front.
  const entrance = at(new THREE.Mesh(new THREE.CircleGeometry(0.9 * s, 16, 0, Math.PI), material(0x1a1208)), 0, base + 0.15 * s, 3.85 * s);
  skep.add(entrance);
  const door = new THREE.Vector3(0, base + 0.6 * s, 4.2 * s);

  // Flowers round the meadow: a stem, petals and a yellow heart.
  const stem = material(0x3f7d2c);
  const heart = material(0xffd23f);
  const flowers = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 2.399963 + 0.5;
    const r = (6.5 + 3.5 * random(i)) * s;
    const tall = (1.6 + 1.4 * random(i + 20)) * s;
    const group = at(new THREE.Group(), Math.cos(angle) * r, 0.8 * s, Math.sin(angle) * r);
    group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.1 * s, tall, 5), stem), 0, tall / 2, 0));
    const petals = at(new THREE.Mesh(new THREE.SphereGeometry(0.6 * s, 12, 8), material([0xff6fa5, 0xffffff, 0xa77bf3, 0xff9f40][i % 4])), 0, tall, 0);
    petals.scale.y = 0.4;
    group.add(petals, at(new THREE.Mesh(new THREE.SphereGeometry(0.25 * s, 8, 6), heart), 0, tall + 0.2 * s, 0));
    return { group, top: new THREE.Vector3(group.position.x, 0.8 * s + tall + 0.7 * s, group.position.z) };
  });

  // The bees: the first twelve on their rounds, the rest only in the swarm.
  const materials = {
    yellow: material(0xffc21a, { roughness: 0.5 }),
    black: material(0x1b1b1b),
    wing: new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  };
  const workers = 12;
  const bees = Array.from({ length: 30 }, (_, i) => ({
    ...bee(s, materials),
    flower: flowers[i % flowers.length].top,
    period: 6 + 4 * random(i + 40),
    start: random(i + 60),
    orbit: (3.5 + 3 * random(i + 80)) * s,
    lift: (1 + 6 * random(i + 100)) * s,
    speed: (0.8 + 0.8 * random(i + 120)) * (i % 2 ? 1 : -1),
  }));

  const { root } = standing(meadow, stand, skep, ...flowers.map(({ group }) => group), ...bees.map(({ group }) => group));
  const here = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  // Where a worker bee is at `k` (0 to 1) of its round: out to its flower in an arc, a hover
  // there, back in an arc.
  const round = (b, k, out) => {
    const there = k < 0.4 ? k / 0.4 : k < 0.6 ? 1 : (1 - k) / 0.4;
    const ease = there * there * (3 - 2 * there);
    out.lerpVectors(door, b.flower, ease);
    out.y += Math.sin(Math.PI * ease) * 3 * s;
    if (k >= 0.4 && k < 0.6) out.x += Math.sin(k * 90) * 0.3 * s;
    return out;
  };
  // A swarming bee: circling the hive at its own height and speed.
  const circling = (b, t, out) => out.set(Math.cos(t * b.speed + b.start * 6.28) * b.orbit, base + b.lift + Math.sin(t * 3 + b.start * 9) * 0.5 * s, Math.sin(t * b.speed + b.start * 6.28) * b.orbit);
  let clock = 0;
  let swarmedAt = -Infinity;
  return {
    object: root,
    touch: () => {
      if (clock - swarmedAt < 1) return null;
      swarmedAt = clock;
      return "Buzz!";
    },
    animate: (t) => {
      clock = t;
      const swarming = t - swarmedAt < 5;
      bees.forEach((b, i) => {
        const worker = i < workers;
        b.group.visible = worker || swarming;
        if (!b.group.visible) return;
        if (swarming) {
          circling(b, t, here);
          circling(b, t + 0.05, ahead);
        } else {
          round(b, (t / b.period + b.start) % 1, here);
          round(b, ((t + 0.05) / b.period + b.start) % 1, ahead);
        }
        b.group.position.copy(here);
        // Facing the way it flies; a small bob.
        b.group.rotation.y = Math.atan2(ahead.x - here.x, ahead.z - here.z);
        b.group.position.y += Math.sin(t * 9 + i) * 0.1 * s;
        for (const { pivot, side } of b.wings) pivot.rotation.z = side * (0.2 + 0.6 * Math.abs(Math.sin(t * 60 + i)));
      });
    },
  };
}

// A skate park: a half-pipe on a concrete pad with a grind rail in front, and a skater riding
// it from wall to wall, an air with a full turn above each coping. A tap: a kickflip on the
// next air, the board spinning under the feet.
export function skatePark(size) {
  const s = size / 20;
  const pad = at(new THREE.Mesh(new THREE.BoxGeometry(25 * s, 0.6 * s, 14 * s), material(0x9aa0a6, { roughness: 0.95 })), 0, 0.3 * s, 0);
  // The half-pipe: its cross-section (x, y) extruded along z, the faces at the ends painted.
  const floor = 0.9 * s;
  const flat = 4 * s;
  const radius = 5 * s;
  const deck = 1.5 * s;
  const edge = flat + radius + deck;
  const shape = new THREE.Shape();
  shape.moveTo(-edge, 0.6 * s);
  shape.lineTo(edge, 0.6 * s);
  shape.lineTo(edge, floor + radius);
  shape.lineTo(flat + radius, floor + radius);
  shape.absarc(flat, floor + radius, radius, 0, -Math.PI / 2, true);
  shape.lineTo(-flat, floor);
  shape.absarc(-flat, floor + radius, radius, -Math.PI / 2, -Math.PI, true);
  shape.lineTo(-edge, floor + radius);
  shape.lineTo(-edge, 0.6 * s);
  const depth = 7 * s;
  const ramp = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 }), [
    material(0x3a86ff, { roughness: 0.6 }),
    material(0xe9e4da, { roughness: 0.8 }),
  ]);
  ramp.position.z = -depth / 2 - 2 * s;
  // The copings: steel pipes along the lips.
  const steel = material(0xc9ced6, { metalness: 0.8, roughness: 0.3 });
  const copings = [-1, 1].map((side) => {
    const pipe = at(new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, depth, 12), steel), side * (flat + radius), floor + radius, -2 * s);
    pipe.rotation.x = Math.PI / 2;
    return pipe;
  });
  // A grind rail in front, and a stripe of paint on the pad.
  const rail = at(new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 10 * s, 10), steel), 0, 1.8 * s, 4.5 * s);
  rail.rotation.z = Math.PI / 2;
  const posts = [-4, 4].map((x) => at(new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.18 * s, 1.2 * s, 8), steel), x * s, 1.2 * s, 4.5 * s));
  const paint = at(new THREE.Mesh(new THREE.BoxGeometry(24 * s, 0.05 * s, 0.5 * s), material(0xffd23f)), 0, 0.62 * s, 6.3 * s);

  // The skater, in the board's frame: x along the board, y away from the riding surface, the
  // rider facing +z (toward the viewer), side on to the board, as skaters stand.
  const rider = new THREE.Group();
  const board = at(new THREE.Group(), 0, 0.5 * s, 0);
  board.add(at(new THREE.Mesh(new THREE.BoxGeometry(3.2 * s, 0.18 * s, 1 * s), material(0xe63946)), 0, 0.3 * s, 0));
  for (const x of [-1.1, 1.1]) {
    for (const z of [-0.35, 0.35]) {
      const wheel = at(new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.18 * s, 10), material(0xf1faee)), x * s, 0, z * s);
      wheel.rotation.x = Math.PI / 2;
      board.add(wheel);
    }
  }
  const shirt = material(0x2a9d8f);
  const jeans = material(0x264653);
  const skin = material(0xc68642);
  const legs = [-1, 1].map((side) => {
    const leg = at(new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * s, 1.8 * s, 4, 8), jeans), side * 0.75 * s, 2 * s, 0);
    leg.rotation.z = side * 0.18;
    return leg;
  });
  const torso = at(new THREE.Mesh(new THREE.CapsuleGeometry(0.6 * s, 1.4 * s, 4, 10), shirt), 0, 4 * s, 0);
  const head = at(new THREE.Mesh(new THREE.SphereGeometry(0.55 * s, 16, 12), skin), 0, 5.6 * s, 0);
  const helmet = at(new THREE.Mesh(new THREE.SphereGeometry(0.62 * s, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(0xf4a261)), 0, 5.7 * s, 0);
  const arms = [-1, 1].map((side) => {
    const pivot = at(new THREE.Group(), side * 0.7 * s, 4.7 * s, 0);
    const arm = at(new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * s, 1.4 * s, 4, 8), shirt), 0, -0.9 * s, 0);
    pivot.add(arm);
    pivot.rotation.z = side * 1.1;
    return pivot;
  });
  rider.add(board, ...legs, torso, head, helmet, ...arms);
  // Where the board touches (`skater`), turned about the vertical in the air (`spin`), tilted
  // to the ramp's surface (`lean`).
  const skater = new THREE.Group();
  const spin = new THREE.Group();
  const lean = new THREE.Group();
  lean.add(rider);
  spin.add(lean);
  skater.add(spin);

  const { root } = standing(pad, ramp, ...copings, rail, ...posts, paint, skater);
  const arc = (Math.PI / 2) * radius;
  const lip = flat + arc;
  const air = 3 * s;
  const period = 3.4;
  let clock = 0;
  let trickAt = -Infinity;
  return {
    object: root,
    touch: () => {
      if (clock - trickAt < period / 2) return null;
      trickAt = clock;
      return "Kickflip!";
    },
    animate: (t) => {
      clock = t;
      // Along the ramp's cross-section from its middle (`along`), there and back: slowest at
      // the top of each air, as a ball thrown up is.
      const phase = (t / period) * Math.PI * 2;
      const along = (lip + air) * Math.sin(phase);
      const side = Math.sign(along) || 1;
      const distance = Math.abs(along);
      let x;
      let y;
      let tilt;
      if (distance <= flat) {
        [x, y, tilt] = [along, floor, 0];
      } else if (distance <= lip) {
        const angle = (distance - flat) / radius;
        [x, y, tilt] = [side * (flat + radius * Math.sin(angle)), floor + radius * (1 - Math.cos(angle)), side * angle];
      } else {
        [x, y, tilt] = [side * (flat + radius), floor + radius + (distance - lip), (side * Math.PI) / 2];
      }
      // In the air: straightening up toward the top, and a full turn about the vertical,
      // rising and falling; with a trick asked, the board flips about its length too.
      const airborne = distance > lip;
      const rising = Math.cos(phase) * side > 0;
      const share = airborne ? (distance - lip) / air : 0;
      const progress = airborne ? (rising ? share / 2 : 1 - share / 2) : 0;
      skater.position.set(x, y, -2 * s);
      lean.rotation.z = airborne ? tilt * (1 - share) : tilt;
      spin.rotation.y = progress * Math.PI * 2;
      const flipping = airborne && t - trickAt < period / 2 + 0.2;
      board.rotation.x = flipping ? progress * Math.PI * 2 : 0;
      board.position.y = (0.5 + (flipping ? Math.sin(progress * Math.PI) * 0.8 : 0)) * s;
      // Crouching low in the bottom, arms out for balance.
      const crouch = distance <= flat ? 0.15 : 0;
      for (const leg of legs) leg.scale.y = 1 - crouch;
      for (const [i, arm] of arms.entries()) arm.rotation.z = (i ? 1 : -1) * (1.1 + 0.3 * Math.sin(t * 2.2 + i));
    },
  };
}
