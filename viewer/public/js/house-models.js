// A house in its garden, as the day is: a shingled roof, framed windows with shutters, a
// porch with its lamp, smoke from the chimney; a path of stepping stones to the mailbox, a
// picket fence, flower beds, a tree with a swing and a bird circling it. After dark (18 to 7
// o'clock on the viewer's clock) the windows and the porch lamp are lit and fireflies come
// out. A tap switches the lights, room by room.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { dot } from "./dot.js";
import { risers } from "./nature-models.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options });

function at(object, x = 0, y = 0, z = 0) {
  object.position.set(x, y, z);
  return object;
}

// The same numbers every run (the pictures are rendered from the models): 0 to 1 from i.
const random = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const box = (w, h, d, surface) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), surface);

export function house(size, { now }) {
  const s = size;
  const ground = s * 0.03;
  const lawn = at(new THREE.Mesh(new THREE.CylinderGeometry(s * 0.46, s * 0.47, ground, 48), material(0x6a994e)), 0, ground / 2, 0);
  const soil = at(new THREE.Mesh(new THREE.CylinderGeometry(s * 0.47, s * 0.44, s * 0.02, 48), material(0x6f4e37)), 0, -s * 0.008, 0);

  // The house: walls on a stone footing, white trim at the corners.
  const home = at(new THREE.Group(), 0, ground, -s * 0.07);
  const width = s * 0.38;
  const depth = s * 0.25;
  const wallHeight = s * 0.21;
  // A glow of their own: the front faces the camera, which the scene's lights leave dim.
  const wall = material(0xf2e8cf, { emissive: 0xf2e8cf, emissiveIntensity: 0.22 });
  const trim = material(0xffffff, { roughness: 0.6 });
  home.add(at(box(width + s * 0.01, s * 0.02, depth + s * 0.01, material(0x8d8d8d, { flatShading: true })), 0, s * 0.01, 0));
  home.add(at(box(width, wallHeight, depth, wall), 0, wallHeight / 2 + s * 0.01, 0));
  for (const x of [-1, 1]) for (const z of [-1, 1]) home.add(at(box(s * 0.012, wallHeight, s * 0.012, trim), (x * width) / 2, wallHeight / 2 + s * 0.01, (z * depth) / 2));
  const eaves = wallHeight + s * 0.01;

  // The roof: two slopes of shingle rows over a gable, a ridge along the top.
  const overhang = s * 0.03;
  const rise = s * 0.13;
  const half = depth / 2 + overhang;
  const slope = Math.hypot(half, rise);
  const pitch = Math.atan2(rise, half);
  const roof = material(0xb5241c, { flatShading: true, emissive: 0x6a040f, emissiveIntensity: 0.45 });
  const shingles = material(0x8f1d18, { flatShading: true, emissive: 0x5c0a0a, emissiveIntensity: 0.4 });
  for (const side of [-1, 1]) {
    const panel = at(new THREE.Group(), 0, eaves + rise / 2 - s * 0.005, (side * half) / 2);
    panel.rotation.x = side * pitch;
    panel.add(box(width + 2 * overhang, s * 0.012, slope, roof));
    // Rows of shingles: strips along the slope's length, each a step proud of the panel.
    for (let row = 0; row < 5; row++) {
      const strip = at(box(width + 2 * overhang, s * 0.006, slope / 6, row % 2 ? shingles : roof), 0, s * 0.008, -slope / 2 + (row + 0.6) * (slope / 5));
      panel.add(strip);
    }
    home.add(panel);
  }
  const ridge = at(new THREE.Mesh(new THREE.CylinderGeometry(s * 0.012, s * 0.012, width + 2 * overhang, 8), shingles), 0, eaves + rise + s * 0.002, 0);
  ridge.rotation.z = Math.PI / 2;
  home.add(ridge);
  // The gables: triangles of wall under the roof's ends; an attic window, round, in one.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-depth / 2, 0);
  gableShape.lineTo(depth / 2, 0);
  gableShape.lineTo(0, rise * (depth / 2 / half));
  gableShape.closePath();
  const gableGeometry = new THREE.ExtrudeGeometry(gableShape, { depth: s * 0.004, bevelEnabled: false });
  for (const x of [-1, 1]) {
    const gable = at(new THREE.Mesh(gableGeometry, wall), (x * width) / 2 - s * 0.002, eaves, 0);
    gable.rotation.y = Math.PI / 2;
    home.add(gable);
  }

  // The windows: glass that lights up, its white frame and cross, a sill, green shutters. Each
  // has its own glass, so that the rooms light one after another.
  const lights = [];
  const shutter = material(0x2d6a4f);
  const window_ = (x, y, z, turn, shutters = true) => {
    const glass = new THREE.MeshStandardMaterial({ color: 0x8fb8de, emissive: 0xffc56b, emissiveIntensity: 0, roughness: 0.15, metalness: 0.2 });
    const group = at(new THREE.Group(), x, y, z);
    group.rotation.y = turn;
    const w = s * 0.055;
    const h = s * 0.06;
    group.add(box(w + s * 0.01, h + s * 0.01, s * 0.004, trim));
    group.add(at(box(w, h, s * 0.004, glass), 0, 0, s * 0.002));
    group.add(at(box(w, s * 0.004, s * 0.003, trim), 0, 0, s * 0.005));
    group.add(at(box(s * 0.004, h, s * 0.003, trim), 0, 0, s * 0.005));
    group.add(at(box(w + s * 0.018, s * 0.007, s * 0.014, trim), 0, -h / 2 - s * 0.006, s * 0.006));
    if (shutters) for (const side of [-1, 1]) group.add(at(box(s * 0.024, h + s * 0.008, s * 0.004, shutter), side * (w / 2 + s * 0.019), 0, s * 0.002));
    home.add(group);
    lights.push(glass);
  };
  const windowY = s * 0.01 + wallHeight * 0.58;
  window_(-s * 0.105, windowY, depth / 2 + s * 0.002, 0);
  window_(s * 0.105, windowY, depth / 2 + s * 0.002, 0);
  window_(width / 2 + s * 0.002, windowY, 0, Math.PI / 2, false);
  window_(-width / 2 - s * 0.002, windowY, 0, -Math.PI / 2, false);
  // The attic window: a disc of glass in a white ring, in the gable toward the camera's right.
  const attic = new THREE.MeshStandardMaterial({ color: 0x8fb8de, emissive: 0xffc56b, emissiveIntensity: 0, roughness: 0.15 });
  const roundWindow = at(new THREE.Group(), width / 2 + s * 0.004, eaves + s * 0.04, 0);
  roundWindow.rotation.y = Math.PI / 2;
  roundWindow.add(new THREE.Mesh(new THREE.CircleGeometry(s * 0.02, 20), attic));
  roundWindow.add(new THREE.Mesh(new THREE.TorusGeometry(s * 0.021, s * 0.004, 6, 20), trim));
  home.add(roundWindow);
  lights.push(attic);

  // The door, its frame and knob, a step, the canopy over it and the lamp beside it.
  const doorWidth = s * 0.05;
  const doorHeight = s * 0.1;
  const front = depth / 2;
  home.add(at(box(doorWidth + s * 0.012, doorHeight + s * 0.008, s * 0.004, trim), 0, s * 0.01 + doorHeight / 2 + s * 0.002, front + s * 0.001));
  home.add(at(box(doorWidth, doorHeight, s * 0.006, material(0x1d3557)), 0, s * 0.01 + doorHeight / 2, front + s * 0.003));
  for (let p = 0; p < 2; p++) home.add(at(box(doorWidth * 0.7, doorHeight * 0.3, s * 0.002, material(0x274c77)), 0, s * 0.01 + doorHeight * (0.3 + 0.4 * p), front + s * 0.007));
  home.add(at(new THREE.Mesh(new THREE.SphereGeometry(s * 0.005, 8, 6), material(0xd4a017, { metalness: 0.8, roughness: 0.3 })), doorWidth * 0.32, s * 0.01 + doorHeight * 0.48, front + s * 0.008));
  home.add(at(box(doorWidth + s * 0.03, s * 0.012, s * 0.035, material(0x9a9a9a, { flatShading: true })), 0, s * 0.006, front + s * 0.018));
  const canopy = at(box(doorWidth + s * 0.03, s * 0.008, s * 0.04, roof), 0, s * 0.01 + doorHeight + s * 0.016, front + s * 0.018);
  canopy.rotation.x = 0.35;
  home.add(canopy);
  const lampGlass = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffc56b, emissiveIntensity: 0 });
  home.add(at(new THREE.Mesh(new THREE.SphereGeometry(s * 0.008, 10, 8), lampGlass), doorWidth / 2 + s * 0.02, s * 0.01 + doorHeight * 0.8, front + s * 0.008));
  const porchLight = new THREE.PointLight(0xffc56b, 0, s * 0.6, 1.5);
  porchLight.position.set(0, s * 0.01 + doorHeight * 0.8, front + s * 0.05);
  home.add(porchLight);
  const roomLight = new THREE.PointLight(0xffc56b, 0, s * 1.2, 1.5);
  roomLight.position.set(0, s * 0.12, front + s * 0.15);
  home.add(roomLight);

  // The chimney, with its cap, at the back slope; its smoke.
  const chimneyX = width * 0.28;
  home.add(at(box(s * 0.04, s * 0.11, s * 0.04, material(0x9c4a2f, { flatShading: true })), chimneyX, eaves + rise * 0.7, -depth * 0.2));
  home.add(at(box(s * 0.05, s * 0.01, s * 0.05, material(0x5c5c5c)), chimneyX, eaves + rise * 0.7 + s * 0.058, -depth * 0.2));
  const smoke = risers(18, {
    color: 0xe9ecef, size: s * 0.1, height: s * 0.3, speed: 0.28, opacity: 0.35,
    start: (i) => [chimneyX + Math.cos(i) * s * 0.008, eaves + rise * 0.7 + s * 0.065, -depth * 0.2 + Math.sin(i) * s * 0.008],
  });
  home.add(smoke.points);

  // Flower beds along the front wall.
  const blooms = [0xff70a6, 0xffd166, 0xffffff, 0xff9770, 0x9d4edd];
  const flowerBed = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const x = (i < 9 ? -1 : 1) * (s * 0.045 + (i % 9) * s * 0.013);
    const bloom = at(new THREE.Mesh(new THREE.SphereGeometry(s * (0.007 + 0.003 * random(i)), 8, 6), material(blooms[i % 5], { emissive: blooms[i % 5], emissiveIntensity: 0.15 })), x, s * 0.022 + random(i + 30) * s * 0.008, front + s * 0.016 + random(i + 60) * s * 0.012);
    flowerBed.add(bloom);
  }
  const hedge = material(0x386641, { flatShading: true, emissive: 0x1b4332, emissiveIntensity: 0.4 });
  for (const x of [-1, 1]) flowerBed.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.022, 0), hedge), x * (width / 2 + s * 0.01), s * 0.02, front + s * 0.012));
  home.add(flowerBed);

  // The path: stepping stones from the step to the lawn's front edge, and the mailbox there.
  const stones = new THREE.Group();
  const stone = material(0xadb5bd, { flatShading: true });
  for (let i = 0; i < 5; i++) {
    const z = -s * 0.06 + front + s * 0.06 + i * s * 0.05;
    const flat = at(new THREE.Mesh(new THREE.CylinderGeometry(s * (0.02 + 0.004 * random(i)), s * 0.022, s * 0.006, 7), stone), (random(i + 7) - 0.5) * s * 0.02, ground + s * 0.002, z);
    flat.rotation.y = random(i + 11) * 3;
    stones.add(flat);
  }
  const mailbox = at(new THREE.Group(), s * 0.08, ground, s * 0.37);
  mailbox.add(at(box(s * 0.008, s * 0.07, s * 0.008, material(0x6f4518)), 0, s * 0.035, 0));
  const letterbox = at(new THREE.Mesh(new THREE.CylinderGeometry(s * 0.017, s * 0.017, s * 0.045, 12, 1, false, 0, Math.PI), material(0x1d3557, { side: THREE.DoubleSide })), 0, s * 0.072, 0);
  letterbox.rotation.x = Math.PI / 2;
  letterbox.rotation.z = Math.PI / 2;
  mailbox.add(letterbox, at(box(s * 0.034, s * 0.004, s * 0.045, material(0x1d3557)), 0, s * 0.072, 0));
  const mailFlag = at(new THREE.Group(), s * 0.019, s * 0.075, -s * 0.01);
  mailFlag.add(at(box(s * 0.003, s * 0.03, s * 0.006, material(0xd62828)), 0, s * 0.015, 0));
  mailbox.add(mailFlag);

  // A picket fence round the back half of the lawn.
  const fence = new THREE.Group();
  const white = material(0xf8f9fa, { emissive: 0xffffff, emissiveIntensity: 0.15 });
  const pickets = 34;
  const picket = new THREE.InstancedMesh(new THREE.BoxGeometry(s * 0.01, s * 0.05, s * 0.004), white, pickets);
  const matrix = new THREE.Matrix4();
  const from = Math.PI * 1.08;
  const to = Math.PI * 1.92;
  for (let i = 0; i < pickets; i++) {
    const angle = from + ((to - from) * i) / (pickets - 1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle - Math.PI / 2);
    matrix.compose(new THREE.Vector3(Math.cos(angle) * s * 0.43, ground + s * 0.025, Math.sin(angle) * s * 0.43), q, new THREE.Vector3(1, 1, 1));
    picket.setMatrixAt(i, matrix);
  }
  fence.add(picket);
  for (const y of [0.014, 0.036]) {
    const rail = at(new THREE.Mesh(new THREE.TorusGeometry(s * 0.428, s * 0.003, 4, 48, to - from), white), 0, ground + s * y, 0);
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = from;
    fence.add(rail);
  }

  // The tree, its branch and the swing hanging from it; a bird circling.
  const tree = at(new THREE.Group(), -s * 0.3, ground, s * 0.12);
  const bark = material(0x6f4518, { flatShading: true });
  tree.add(at(new THREE.Mesh(new THREE.CylinderGeometry(s * 0.016, s * 0.024, s * 0.2, 8), bark), 0, s * 0.1, 0));
  const branch = at(new THREE.Mesh(new THREE.CylinderGeometry(s * 0.008, s * 0.011, s * 0.12, 6), bark), s * 0.05, s * 0.16, 0);
  branch.rotation.z = -1.25;
  tree.add(branch);
  const crown = new THREE.Group();
  const leaves = [0x386641, 0x4f772d, 0x2d6a4f].map((color) => material(color, { flatShading: true, emissive: 0x1b4332, emissiveIntensity: 0.35 }));
  [[0, 0.25, 0, 0.09], [0.06, 0.22, 0.02, 0.07], [-0.055, 0.21, -0.02, 0.07], [0.01, 0.3, -0.03, 0.065], [0.085, 0.19, -0.02, 0.05]].forEach(([x, y, z, r], i) => {
    crown.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(s * r, 1), leaves[i % 3]), x * s, y * s, z * s));
  });
  tree.add(crown);
  const swing = at(new THREE.Group(), s * 0.085, s * 0.17, 0);
  const rope = material(0xd4c4a8);
  for (const z of [-1, 1]) swing.add(at(new THREE.Mesh(new THREE.CylinderGeometry(s * 0.0015, s * 0.0015, s * 0.12, 4), rope), 0, -s * 0.06, z * s * 0.015));
  swing.add(at(box(s * 0.016, s * 0.004, s * 0.04, material(0x8b5a2b)), 0, -s * 0.12, 0));
  tree.add(swing);
  const bird = new THREE.Group();
  const feathers = material(0x264653, { emissive: 0x1d3557, emissiveIntensity: 0.3 });
  bird.add(new THREE.Mesh(new THREE.SphereGeometry(s * 0.008, 8, 6), feathers));
  const wings = [-1, 1].map((side) => {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.02, s * 0.008), material(0x264653, { side: THREE.DoubleSide }));
    wing.geometry.translate(s * 0.01, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.y = side > 0 ? 0 : Math.PI;
    holder.add(wing);
    bird.add(holder);
    return wing;
  });

  // Fireflies over the lawn after dark.
  const glowCount = 16;
  const glowPositions = new Float32Array(glowCount * 3);
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute("position", new THREE.BufferAttribute(glowPositions, 3));
  glowGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, s * 0.1, 0), s * 0.5);
  const glowMaterial = new THREE.PointsMaterial({ color: 0xd9ed92, size: s * 0.025, map: dot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const fireflies = new THREE.Points(glowGeometry, glowMaterial);

  const { root } = standing(soil, lawn, home, stones, mailbox, fence, tree, bird, fireflies);

  let switched = false;
  let switchedAt = -Infinity;
  let wasLit = null;
  let clock = 0;
  const night = () => {
    const hour = now().getHours();
    return hour >= 18 || hour < 7;
  };
  return {
    object: root,
    touch: () => {
      switched = !switched;
      switchedAt = clock;
      return night() !== switched ? "Lights on" : "Lights off";
    },
    animate: (t) => {
      clock = t;
      // A tap turns the lights the other way from what the hour would have them, room by
      // room: a quarter of a second apart.
      const dark = night();
      const lit = dark !== switched;
      if (wasLit === null) wasLit = lit;
      const since = t - switchedAt;
      lights.forEach((glass, i) => {
        const on = since < i * 0.25 ? !lit : lit;
        glass.emissiveIntensity = on ? 1.3 + 0.08 * Math.sin(t * 3 + i * 2) : 0;
      });
      const porchOn = since < lights.length * 0.25 ? !lit : lit;
      lampGlass.emissiveIntensity = porchOn ? 2 : 0;
      porchLight.intensity = porchOn ? 1.2 : 0;
      roomLight.intensity = lit ? 0.8 : 0;
      smoke.update(t);
      crown.rotation.z = 0.025 * Math.sin(t * 1.1);
      // The swing: to and fro, slowly losing and gaining.
      swing.rotation.x = (0.35 + 0.1 * Math.sin(t * 0.3)) * Math.sin(t * 2.2);
      // The mailbox's flag up for half of every twenty seconds: the post has come.
      mailFlag.rotation.z = t % 20 < 10 ? 0 : -Math.PI / 2;
      // The bird: a circle round the tree, wings beating, rising and falling.
      const angle = t * 0.7;
      bird.position.set(tree.position.x + Math.cos(angle) * s * 0.16, s * (0.36 + 0.03 * Math.sin(t * 1.3)), tree.position.z + Math.sin(angle) * s * 0.16);
      bird.rotation.y = -angle;
      for (const wing of wings) wing.rotation.x = 0.6 * Math.sin(t * 14);
      // Fireflies: only after dark, drifting and blinking.
      fireflies.visible = dark;
      for (let i = 0; i < glowCount; i++) {
        const a = random(i) * Math.PI * 2 + t * 0.15 * (random(i + 20) - 0.5);
        const r = s * (0.2 + 0.2 * random(i + 40));
        glowPositions.set([Math.cos(a) * r + Math.sin(t * 0.7 + i) * s * 0.02, ground + s * (0.04 + 0.1 * random(i + 60)) + Math.sin(t * 1.1 + i) * s * 0.02, Math.sin(a) * r], i * 3);
      }
      glowGeometry.attributes.position.needsUpdate = true;
      glowMaterial.opacity = 0.6 + 0.4 * Math.sin(t * 3);
    },
  };
}
