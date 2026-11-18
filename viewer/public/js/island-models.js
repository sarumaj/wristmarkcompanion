// A treasure chest on a small island: built of planks with iron corners, bands, rivets and a
// lock, a heap of coins, gems and a goblet inside, a palm tree, shells and a starfish on the
// sand, the sea lapping round it. A loop of the time alone; a tap opens or closes the lid, a
// shake of the wrist rattles the chest.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { risers } from "./nature-models.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options });

function at(object, x = 0, y = 0, z = 0) {
  object.position.set(x, y, z);
  return object;
}

// The same numbers every run (the pictures are rendered from the models): 0 to 1 from i.
const random = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Easing: in and out, and out past the end and back (the lid swinging open).
const smooth = (k) => k * k * (3 - 2 * k);
const overshoot = (k) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

// A palm tree: a curved trunk of rings, and fronds that droop and sway; `update(t)` sways it.
function palm(size) {
  const tree = new THREE.Group();
  const bark = material(0x8d6e4a, { flatShading: true });
  const rings = 9;
  let top = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const k = i / rings;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(size * (0.022 - 0.008 * k), size * (0.026 - 0.008 * k), size * 0.062, 8), bark);
    // The trunk leans out and up, curving.
    top = new THREE.Vector3(size * 0.09 * k * k, size * 0.06 * i + size * 0.03, 0);
    at(ring, top.x, top.y, top.z);
    ring.rotation.z = -0.5 * k;
    tree.add(ring);
  }
  const crown = at(new THREE.Group(), top.x, top.y + size * 0.03, top.z);
  const leaf = material(0x2d6a4f, { side: THREE.DoubleSide, flatShading: true });
  const fronds = [];
  for (let i = 0; i < 7; i++) {
    // A frond: a long narrow leaf shape, bent down along its length.
    const shape = new THREE.Shape();
    const length = size * (0.2 + 0.03 * random(i));
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(length * 0.5, size * 0.04, length, 0);
    shape.quadraticCurveTo(length * 0.5, -size * 0.04, 0, 0);
    const geometry = new THREE.ShapeGeometry(shape, 8);
    const position = geometry.attributes.position;
    for (let v = 0; v < position.count; v++) {
      const x = position.getX(v);
      position.setZ(v, position.getY(v));
      position.setY(v, -((x / length) ** 2) * size * 0.1);
    }
    geometry.computeVertexNormals();
    const frond = new THREE.Mesh(geometry, leaf);
    const holder = new THREE.Group();
    holder.rotation.y = (i / 7) * Math.PI * 2 + random(i + 9);
    holder.add(frond);
    crown.add(holder);
    fronds.push(frond);
  }
  crown.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.025, 10, 8), material(0x5c4033)));
  for (let i = 0; i < 3; i++) {
    const nut = at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.016, 10, 8), material(0x4a3626)), Math.cos(i * 2.1) * size * 0.022, -size * 0.022, Math.sin(i * 2.1) * size * 0.022);
    crown.add(nut);
  }
  tree.add(crown);
  return {
    tree,
    update(t) {
      fronds.forEach((frond, i) => (frond.rotation.z = 0.08 * Math.sin(t * 1.3 + i)));
      crown.rotation.z = 0.03 * Math.sin(t * 0.7);
    },
  };
}

// A five-pointed starfish, lying on the sand.
function starfish(size, color) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? size * 0.012 : size * 0.034;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: size * 0.006, bevelEnabled: true, bevelThickness: size * 0.004, bevelSize: size * 0.004, bevelSegments: 2 });
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, material(color, { roughness: 0.9 }));
}

// A shell: a ribbed fan.
function shell(size, color) {
  const geometry = new THREE.SphereGeometry(size * 0.022, 12, 6, 0, Math.PI, 0, Math.PI / 2);
  geometry.scale(1, 0.5, 1);
  return new THREE.Mesh(geometry, material(color, { roughness: 0.5, flatShading: true }));
}

// The treasure chest on its island. Open to start with: the gold shows.
export function treasureChest(size) {
  const ground = size * 0.035;
  // The island: sand, a little higher in the middle, and the sea round its edge.
  const sandGeometry = new THREE.CylinderGeometry(size * 0.43, size * 0.47, ground, 48, 1);
  const sand = at(new THREE.Mesh(sandGeometry, material(0xe9c46a, { roughness: 1 })), 0, ground / 2, 0);
  const seaMaterial = new THREE.MeshStandardMaterial({ color: 0x2a9d8f, transparent: true, opacity: 0.75, roughness: 0.15, metalness: 0.1 });
  const sea = at(new THREE.Mesh(new THREE.RingGeometry(size * 0.41, size * 0.5, 64, 1), seaMaterial), 0, ground * 0.55, 0);
  sea.rotation.x = -Math.PI / 2;
  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  const foam = at(new THREE.Mesh(new THREE.RingGeometry(size * 0.43, size * 0.445, 64, 1), foamMaterial), 0, ground * 0.6, 0);
  foam.rotation.x = -Math.PI / 2;

  // The chest: a hollow box of planks, open at the top, its lid hinged at the back.
  const width = size * 0.4;
  const depth = size * 0.25;
  const height = size * 0.17;
  const wall = size * 0.018;
  const chest = at(new THREE.Group(), size * 0.03, ground, size * 0.04);
  chest.rotation.y = -0.25;
  const woods = [0x7f4f24, 0x8b5a2b, 0x74461f].map((color) => material(color, { roughness: 0.85 }));
  const iron = material(0x3d4146, { metalness: 0.7, roughness: 0.45 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.3 });
  const body = new THREE.Group();
  chest.add(body);
  // Three boards to a side, a hair apart, each a slightly other brown.
  const boards = 3;
  const board = height / boards;
  for (let b = 0; b < boards; b++) {
    const y = board * (b + 0.5);
    const wood = woods[b % 3];
    for (const z of [-1, 1]) body.add(at(new THREE.Mesh(new THREE.BoxGeometry(width, board * 0.94, wall), wood), 0, y, z * (depth - wall) / 2));
    for (const x of [-1, 1]) body.add(at(new THREE.Mesh(new THREE.BoxGeometry(wall, board * 0.94, depth - 2 * wall), woods[(b + 1) % 3]), x * (width - wall) / 2, y, 0));
  }
  body.add(at(new THREE.Mesh(new THREE.BoxGeometry(width, wall, depth), woods[2]), 0, wall / 2, 0));
  // Iron at the corners, two bands round it, and rivets on the bands.
  const corner = size * 0.03;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      body.add(at(new THREE.Mesh(new THREE.BoxGeometry(corner, height + size * 0.004, size * 0.006), iron), x * (width / 2 - corner / 2 + size * 0.002), height / 2, z * (depth / 2 + size * 0.002)));
      body.add(at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.006, height + size * 0.004, corner), iron), x * (width / 2 + size * 0.002), height / 2, z * (depth / 2 - corner / 2 + size * 0.002)));
    }
  }
  const rivet = new THREE.SphereGeometry(size * 0.0045, 6, 4);
  for (const x of [-0.3, 0.3]) {
    for (const z of [-1, 1]) body.add(at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.022, height + size * 0.004, size * 0.004), iron), x * width, height / 2, z * (depth / 2 + size * 0.002)));
    for (const y of [0.25, 0.75]) {
      for (const z of [-1, 1]) body.add(at(new THREE.Mesh(rivet, brass), x * width, y * height, z * (depth / 2 + size * 0.004)));
    }
  }
  // The lock plate and its keyhole on the front, handles on the sides.
  body.add(at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.05, size * 0.06, size * 0.006), brass), 0, height * 0.72, depth / 2 + size * 0.004));
  const keyhole = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.006, size * 0.004, 10), material(0x111111)), 0, height * 0.76, depth / 2 + size * 0.008);
  keyhole.rotation.x = Math.PI / 2;
  body.add(keyhole);
  body.add(at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.005, size * 0.012, size * 0.004), material(0x111111)), 0, height * 0.7, depth / 2 + size * 0.008));
  for (const x of [-1, 1]) {
    const handle = at(new THREE.Mesh(new THREE.TorusGeometry(size * 0.022, size * 0.004, 6, 16, Math.PI), iron), x * (width / 2 + size * 0.008), height * 0.62, 0);
    handle.rotation.set(0, Math.PI / 2, Math.PI);
    body.add(handle);
  }

  // The hoard: a heap of coins, gems on it, a goblet standing in it.
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xb07d00, emissiveIntensity: 0.35, metalness: 0.9, roughness: 0.28 });
  const coinGeometry = new THREE.CylinderGeometry(size * 0.016, size * 0.016, size * 0.004, 14);
  const heap = 110;
  const coins = new THREE.InstancedMesh(coinGeometry, gold, heap);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < heap; i++) {
    const u = random(i) * 2 - 1;
    const v = random(i + 500) * 2 - 1;
    const x = u * (width / 2 - wall * 1.5);
    const z = v * (depth / 2 - wall * 1.5);
    // A mound: highest in the middle, over the rim a little.
    const y = height * 0.55 + height * 0.55 * (1 - u * u) * (1 - v * v) + random(i + 900) * size * 0.012;
    euler.set((random(i + 1) - 0.5) * 1.2, random(i + 2) * 6, (random(i + 3) - 0.5) * 1.2);
    matrix.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(euler), one);
    coins.setMatrixAt(i, matrix);
  }
  const fill = at(new THREE.Mesh(new THREE.BoxGeometry(width - 2 * wall, height * 0.5, depth - 2 * wall), gold), 0, height * 0.5, 0);
  const gems = [];
  [[0xe63946, -0.25, 0.1], [0x2a9d8f, 0.2, -0.2], [0x4361ee, 0.05, 0.25], [0x9d4edd, -0.1, -0.25], [0xe63946, 0.3, 0.2]].forEach(([color, u, v], i) => {
    const gemMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, metalness: 0.2, roughness: 0.1, flatShading: true });
    const gem = at(new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.017), gemMaterial), u * width, height * 1.08 - Math.abs(u) * height * 0.3, v * depth);
    gem.rotation.set(random(i) * 3, random(i + 4) * 3, 0);
    gem.scale.y = 1.3;
    gems.push(gem);
  });
  const goblet = at(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.018, 0], [0.018, 0.004], [0.004, 0.01], [0.004, 0.03], [0.012, 0.034], [0.02, 0.05], [0.022, 0.065], [0.02, 0.065]].map(([x, y]) => new THREE.Vector2(x * size, y * size)), 16), gold), -width * 0.28, height * 0.85, -depth * 0.12);
  goblet.rotation.z = 0.25;
  body.add(fill, coins, ...gems, goblet);

  // The lid: a curved top of boards, its bands and the hasp, hinged at the back edge.
  const hinge = at(new THREE.Group(), 0, height, -depth / 2);
  const lid = at(new THREE.Group(), 0, 0, depth / 2);
  // Seen from inside too, once it is open.
  const lidWoods = woods.map((wood) => Object.assign(wood.clone(), { side: THREE.DoubleSide }));
  const staves = 5;
  for (let s = 0; s < staves; s++) {
    const geometry = new THREE.CylinderGeometry(depth / 2, depth / 2, width, 4, 1, false, (s / staves) * Math.PI + 0.01, Math.PI / staves - 0.02);
    geometry.rotateZ(Math.PI / 2);
    lid.add(new THREE.Mesh(geometry, lidWoods[s % 3]));
  }
  // Its ends: half discs.
  for (const x of [-1, 1]) {
    const end = at(new THREE.Mesh(new THREE.CircleGeometry(depth / 2, 20, 0, Math.PI), woods[1]), (x * width) / 2, 0, 0);
    end.rotation.y = (x * Math.PI) / 2;
    end.material = lidWoods[1];
    lid.add(end);
  }
  for (const x of [-0.3, 0.3]) {
    const band = new THREE.CylinderGeometry(depth / 2 + size * 0.003, depth / 2 + size * 0.003, size * 0.022, 20, 1, true, 0, Math.PI);
    band.rotateZ(Math.PI / 2);
    lid.add(at(new THREE.Mesh(band, iron), x * width, 0, 0));
  }
  const hasp = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.03, size * 0.045, size * 0.005), brass), 0, -size * 0.012, depth / 2 + size * 0.004);
  lid.add(hasp);
  hinge.add(lid);
  chest.add(hinge);

  // The light of the gold, sparkles over it, and coins thrown out as it opens.
  const glow = new THREE.PointLight(0xffb703, 0, size * 1.4, 1.5);
  glow.position.set(0, height + size * 0.12, 0);
  chest.add(glow);
  const sparkles = risers(18, {
    color: 0xfff3b0, size: size * 0.03, height: size * 0.32, speed: 0.55, opacity: 0.9, blending: THREE.AdditiveBlending,
    start: (i) => [Math.cos(i * 2.4) * width * 0.32, height * 1.05, Math.sin(i * 2.4) * depth * 0.3],
  });
  chest.add(sparkles.points);
  const thrown = 9;
  const flying = new THREE.InstancedMesh(coinGeometry, gold, thrown);
  flying.frustumCulled = false;
  const flights = Array.from({ length: thrown }, (_, i) => {
    const angle = (i / thrown) * Math.PI * 2 + random(i + 40);
    const reach = size * (0.17 + 0.1 * random(i + 41));
    return { dx: Math.cos(angle) * reach, dz: Math.sin(angle) * reach, delay: 0.25 + 0.06 * i, height: size * (0.18 + 0.1 * random(i + 42)), spin: 6 + 6 * random(i + 43) };
  });
  // Puffs of sand where the chest thumps down shut.
  const dust = risers(10, {
    color: 0xf4e1a6, size: size * 0.05, height: size * 0.06, speed: 1.2, opacity: 0.5,
    start: (i) => [Math.cos(i * 0.63) * width * 0.6, size * 0.01, Math.sin(i * 0.63) * depth * 0.7],
  });
  chest.add(dust.points);

  const tree = palm(size);
  at(tree.tree, -size * 0.26, ground, -size * 0.18);
  const details = [
    at(starfish(size, 0xf4845f), size * 0.25, ground + size * 0.004, size * 0.24),
    at(shell(size, 0xffe5d9), -size * 0.22, ground, size * 0.27),
    at(shell(size, 0xfcd5ce), size * 0.33, ground, -size * 0.1),
  ];
  details[0].rotation.y = 0.6;
  details[1].rotation.y = 2.2;
  const { root } = standing(sea, foam, sand, chest, flying, tree.tree, ...details);

  let open = true;
  // Long ago, not -Infinity: the sand's puffs are positions computed from the time since.
  let movedAt = -1000;
  let rattledAt = -Infinity;
  let clock = 0;
  const rattle = () => {
    rattledAt = clock;
  };
  return {
    object: root,
    touch: () => {
      open = !open;
      movedAt = clock;
      return open ? "Opened" : "Closed";
    },
    // A shake of the wrist rattles it: the coins jump, or the closed lid knocks.
    gesture: (event) => {
      if (event.name !== "shake") return false;
      rattle();
      return true;
    },
    animate: (t) => {
      clock = t;
      const since = t - movedAt;
      // Opening: a knock of the lid first, then it swings open past its stop and settles;
      // closing: it falls shut with a thump and a puff of sand.
      let openness;
      if (open) openness = since < 0.25 ? 0.04 * Math.sin(since * 40) : overshoot(Math.min(1, (since - 0.25) / 1.1));
      else openness = 1 - smooth(Math.min(1, since / 0.7)) ** 2;
      hinge.rotation.x = -openness * 1.85;
      const thump = !open && since > 0.7 && since < 1.3 ? Math.exp(-(since - 0.7) * 8) : 0;
      dust.points.visible = thump > 0.05;
      dust.update(since);
      // Closed, it stirs now and then: a rattle, light from the seam.
      const idle = !open && since > 3 ? (t % 7) < 0.6 : false;
      const shaken = t - rattledAt < 0.8;
      const shiver = (idle || shaken ? 1 : 0) * Math.sin(t * 50) * 0.02;
      chest.rotation.z = shiver;
      if (!open && (idle || shaken)) hinge.rotation.x = -0.06 * Math.abs(Math.sin(t * 25));
      chest.position.y = ground + size * 0.006 * thump;
      const lit = Math.max(0, openness);
      glow.intensity = 2.6 * lit + (!open && (idle || shaken) ? 0.8 : 0);
      gold.emissiveIntensity = 0.25 + 0.45 * lit;
      gems.forEach((gem, i) => {
        gem.material.emissiveIntensity = 0.2 + 0.6 * lit * (0.5 + 0.5 * Math.sin(t * 3 + i * 1.7));
        gem.rotation.y += 0.01;
      });
      // Shaken open, the heap jumps.
      coins.position.y = open && shaken ? size * 0.012 * Math.abs(Math.sin((t - rattledAt) * 12)) * (1 - (t - rattledAt) / 0.8) : 0;
      sparkles.points.visible = lit > 0.5;
      sparkles.update(t);
      // Coins thrown out of the opening chest: up, over and down onto the sand, where they
      // lie a while and sink in.
      const top = new THREE.Vector3(chest.position.x, ground + height * 1.1, chest.position.z);
      flights.forEach((flight, i) => {
        const k = open ? (since - flight.delay) / 0.9 : -1;
        let scale = 1;
        let x = top.x;
        let y = -size;
        let z = top.z;
        if (k >= 0) {
          const f = Math.min(1, k);
          x = top.x + flight.dx * f;
          z = top.z + flight.dz * f;
          y = top.y + (ground + size * 0.004 - top.y) * f + 4 * flight.height * f * (1 - f);
          // Three seconds on the sand, then sinking in over one and a half.
          if (k > 4) scale = Math.max(0, 1 - (k - 4) / 1.5);
        }
        euler.set(k >= 0 && k < 1 ? t * flight.spin : 0, i, 0);
        matrix.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(euler), new THREE.Vector3(scale, scale, scale));
        flying.setMatrixAt(i, matrix);
      });
      flying.instanceMatrix.needsUpdate = true;
      // The sea laps: the foam line breathes, the water shimmers.
      foam.scale.setScalar(1 + 0.015 * Math.sin(t * 1.4));
      foamMaterial.opacity = 0.35 + 0.2 * Math.sin(t * 1.4);
      seaMaterial.opacity = 0.7 + 0.08 * Math.sin(t * 0.9);
      tree.update(t);
    },
  };
}
