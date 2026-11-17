// Places and things on the watch: a castle, a house, a snowman, a treasure chest, a rain
// cloud. Loops of the time alone (the house reads the clock), from three.js's shapes; a tap
// opens, lights or sets each off.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { dot } from "./dot.js";
import { risers } from "./nature-models.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options });

function at(mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  return mesh;
}

// A flag on a pole: a cloth of a few columns whose vertices wave; `update(t)` waves it.
function flag(width, height, color) {
  const geometry = new THREE.PlaneGeometry(width, height, 8, 2);
  geometry.translate(width / 2, 0, 0);
  const rest = geometry.attributes.position.array.slice();
  const cloth = new THREE.Mesh(geometry, material(color, { side: THREE.DoubleSide }));
  return {
    cloth,
    update(t) {
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const x = rest[i * 3];
        position.setZ(i, Math.sin(t * 6 - x * 0.9) * (x / width) * height * 0.25);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
    },
  };
}

// A castle on a hill: four round towers with cone roofs and flags in the wind, walls with
// battlements, a gatehouse. A tap lowers the drawbridge, or raises it.
export function castle(size) {
  const hill = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.5, size * 0.56, size * 0.06, 40), material(0x588157)), 0, size * 0.03, 0);
  const stone = material(0xb5a99a, { flatShading: true });
  const roofs = material(0x3a5a9b);
  const half = size * 0.26;
  const wallHeight = size * 0.2;
  const ground = size * 0.06;
  const parts = [];
  const flags = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tower = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.075, size * 0.08, size * 0.34, 16), stone), x * half, ground + size * 0.17, z * half);
    const roof = at(new THREE.Mesh(new THREE.ConeGeometry(size * 0.095, size * 0.14, 16), roofs), x * half, ground + size * 0.41, z * half);
    const pole = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.003, size * 0.003, size * 0.1, 4), material(0x343a40)), x * half, ground + size * 0.53, z * half);
    const banner = flag(size * 0.07, size * 0.04, x * z > 0 ? 0xd62828 : 0xfcbf49);
    banner.cloth.position.set(x * half, ground + size * 0.56, z * half);
    parts.push(tower, roof, pole, banner.cloth);
    flags.push(banner);
  }
  // The walls between the towers, with merlons along their tops.
  for (const [x, z, along] of [[0, -1, "x"], [0, 1, "x"], [-1, 0, "z"], [1, 0, "z"]]) {
    const length = half * 2 - size * 0.12;
    const wall = at(new THREE.Mesh(new THREE.BoxGeometry(along === "x" ? length : size * 0.04, wallHeight, along === "x" ? size * 0.04 : length), stone), x * half, ground + wallHeight / 2, z * half);
    parts.push(wall);
    for (let k = 0; k < 5; k++) {
      const offset = -length / 2 + (k + 0.5) * (length / 5);
      parts.push(at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.035, size * 0.035, size * 0.035), stone), x * half + (along === "x" ? offset : 0), ground + wallHeight + size * 0.017, z * half + (along === "z" ? offset : 0)));
    }
  }
  // The keep in the middle, and the gate in the front wall (toward +z) with its bridge.
  const keep = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.18, size * 0.3, size * 0.18), stone), 0, ground + size * 0.15, 0);
  const keepRoof = at(new THREE.Mesh(new THREE.ConeGeometry(size * 0.15, size * 0.12, 4), roofs), 0, ground + size * 0.36, 0);
  keepRoof.rotation.y = Math.PI / 4;
  const gate = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.08, size * 0.12, size * 0.045), material(0x1b1b1b)), 0, ground + size * 0.06, half + size * 0.003);
  const hinge = at(new THREE.Group(), 0, ground + size * 0.005, half + size * 0.03);
  const bridge = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.08, size * 0.012, size * 0.13), material(0x7f5539)), 0, 0, size * 0.065);
  hinge.add(bridge);
  const { root } = standing(hill, ...parts, keep, keepRoof, gate, hinge);
  // Down to start with: the castle open to visitors.
  let lowered = true;
  let movedAt = -Infinity;
  let clock = 0;
  return {
    object: root,
    touch: () => {
      lowered = !lowered;
      movedAt = clock;
      return lowered ? "Drawbridge down" : "Drawbridge up";
    },
    animate: (t) => {
      clock = t;
      for (const banner of flags) banner.update(t);
      // Up: turned against the gate; down: flat over the moat. Two seconds either way.
      const k = Math.min(1, (t - movedAt) / 2);
      const down = lowered ? k : 1 - k;
      hinge.rotation.x = -(1 - down) * (Math.PI / 2);
    },
  };
}

// A house in its garden, as the day is: lit windows after dark (18 to 7 o'clock on the
// viewer's clock), smoke from the chimney, a tree. A tap switches the lights.
export function house(size, { now }) {
  const lawn = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.5, size * 0.52, size * 0.03, 40), material(0x6a994e)), 0, size * 0.015, 0);
  const ground = size * 0.03;
  const walls = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.36, size * 0.22, size * 0.26), material(0xf2e8cf)), 0, ground + size * 0.11, 0);
  // The roof: a prism along x.
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-size * 0.16, 0);
  roofShape.lineTo(size * 0.16, 0);
  roofShape.lineTo(0, size * 0.15);
  roofShape.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, { depth: size * 0.42, bevelEnabled: false });
  roofGeometry.translate(0, 0, -size * 0.21);
  roofGeometry.rotateY(Math.PI / 2);
  const roof = at(new THREE.Mesh(roofGeometry, material(0xbc4749, { flatShading: true })), 0, ground + size * 0.22, 0);
  const chimney = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.05, size * 0.12, size * 0.05), material(0x8d5524)), size * 0.1, ground + size * 0.32, -size * 0.05);
  const door = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.06, size * 0.11, size * 0.01), material(0x6f4518)), -size * 0.08, ground + size * 0.055, size * 0.131);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9ec5e8, emissive: 0xffc56b, emissiveIntensity: 0, roughness: 0.2 });
  const windows = [[0.06, 0.13, 0.131, 0], [0.13, 0.13, 0.131, 0], [-0.181, 0.13, 0, Math.PI / 2], [0.181, 0.13, 0, Math.PI / 2]].map(([x, y, z, turn]) => {
    const pane = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.05, size * 0.05, size * 0.008), glass), x * size, ground + y * size - size * 0.03, z * size);
    pane.rotation.y = turn;
    return pane;
  });
  const trunk = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.015, size * 0.02, size * 0.14, 8), material(0x6f4518)), -size * 0.33, ground + size * 0.07, size * 0.2);
  const crown = at(new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.09, 1), material(0x386641, { flatShading: true })), -size * 0.33, ground + size * 0.2, size * 0.2);
  const lamp = new THREE.PointLight(0xffc56b, 0, size * 1.2, 1.5);
  lamp.position.set(0, ground + size * 0.12, size * 0.25);
  const smoke = risers(10, {
    color: 0xdee2e6, size: size * 0.07, height: size * 0.3, speed: 0.3, opacity: 0.6,
    start: (i) => [size * 0.1 + Math.cos(i) * size * 0.01, ground + size * 0.39, -size * 0.05 + Math.sin(i) * size * 0.01],
  });
  const { root } = standing(lawn, walls, roof, chimney, door, ...windows, trunk, crown, lamp, smoke.points);
  let switched = false;
  return {
    object: root,
    touch: () => {
      switched = !switched;
      return "Lights";
    },
    animate: (t) => {
      const hour = now().getHours();
      const night = hour >= 18 || hour < 7;
      // A tap turns the lights the other way from what the hour would have them.
      const lit = night !== switched;
      glass.emissiveIntensity = lit ? 1.4 + 0.1 * Math.sin(t * 3) : 0;
      lamp.intensity = lit ? 1.2 : 0;
      smoke.update(t);
      crown.rotation.z = 0.03 * Math.sin(t * 1.1);
    },
  };
}

// A snowman with a hat, a scarf in the wind, coal buttons and a carrot nose, snow falling
// round it. A tap makes it tip its hat.
export function snowman(size) {
  const snowMaterial = material(0xf8f9fa, { roughness: 0.9 });
  const ground = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.42, size * 0.45, size * 0.04, 40), snowMaterial), 0, size * 0.02, 0);
  const bottom = at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.16, 24, 16), snowMaterial), 0, size * 0.17, 0);
  const middle = at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.115, 24, 16), snowMaterial), 0, size * 0.39, 0);
  const head = new THREE.Group();
  head.position.y = size * 0.56;
  const coal = material(0x212529);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.085, 24, 16), snowMaterial));
  for (const side of [-1, 1]) head.add(at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.012, 8, 6), coal), side * size * 0.03, size * 0.02, size * 0.077));
  const nose = at(new THREE.Mesh(new THREE.ConeGeometry(size * 0.014, size * 0.08, 10), material(0xf77f00)), 0, 0, size * 0.11);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);
  const hat = new THREE.Group();
  hat.position.y = size * 0.07;
  hat.add(at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.09, size * 0.09, size * 0.012, 24), coal), 0, 0, 0));
  hat.add(at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.06, size * 0.06, size * 0.09, 24), coal), 0, size * 0.045, 0));
  hat.add(at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.061, size * 0.061, size * 0.015, 24), material(0xc1121f)), 0, size * 0.015, 0));
  head.add(hat);
  const buttons = [0.42, 0.37, 0.32].map((y) => at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.012, 8, 6), coal), 0, size * y, size * 0.112));
  const scarf = at(new THREE.Mesh(new THREE.TorusGeometry(size * 0.08, size * 0.02, 8, 24), material(0xc1121f)), 0, size * 0.49, 0);
  scarf.rotation.x = Math.PI / 2;
  const tail = flag(size * 0.1, size * 0.035, 0xc1121f);
  tail.cloth.position.set(size * 0.05, size * 0.47, size * 0.06);
  tail.cloth.rotation.z = -1.1;
  const arms = [-1, 1].map((side) => {
    const arm = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.008, size * 0.2, 5), material(0x6f4518)), side * size * 0.19, size * 0.43, 0);
    arm.rotation.z = side * -1.0;
    return arm;
  });
  const count = 60;
  const positions = new Float32Array(count * 3);
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  snowGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, size * 0.4, 0), size * 0.6);
  const flakes = new THREE.Points(snowGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: size * 0.03, map: dot(), transparent: true, depthWrite: false }));
  const { root } = standing(ground, bottom, middle, head, ...buttons, scarf, tail.cloth, ...arms, flakes);
  let clock = 0;
  let tippedAt = -Infinity;
  return {
    object: root,
    touch: () => {
      tippedAt = clock;
      return "Hello!";
    },
    animate: (t) => {
      clock = t;
      tail.update(t * 0.6);
      // Tipping the hat: up and tilted forward, and back, in a second and a half.
      const tip = t - tippedAt < 1.5 ? Math.sin(((t - tippedAt) / 1.5) * Math.PI) : 0;
      hat.position.y = size * (0.07 + 0.05 * tip);
      hat.rotation.x = 0.5 * tip;
      arms[1].rotation.z = 1.0 - 1.6 * tip;
      head.rotation.y = 0.2 * Math.sin(t * 0.5);
      for (let i = 0; i < count; i++) {
        const fall = (t * 0.08 * (0.7 + (i % 5) * 0.1) + i / count) % 1;
        const angle = i * 2.39;
        const r = size * (0.08 + 0.32 * ((i * 0.618) % 1));
        positions.set([Math.cos(angle) * r + Math.sin(t + i) * size * 0.02, size * (0.85 - 0.8 * fall), Math.sin(angle) * r], i * 3);
      }
      snowGeometry.attributes.position.needsUpdate = true;
    },
  };
}

// A treasure chest on the sand: its lid opens, gold glows inside and coins sparkle up; it
// closes again. A tap opens or closes it.
export function treasureChest(size) {
  const sand = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.45, size * 0.48, size * 0.03, 40), material(0xe9c46a, { roughness: 1 })), 0, size * 0.015, 0);
  const wood = material(0x7f4f24);
  const iron = material(0x495057, { metalness: 0.6, roughness: 0.4 });
  const ground = size * 0.03;
  const width = size * 0.36;
  const depth = size * 0.22;
  const height = size * 0.16;
  const box = at(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wood), 0, ground + height / 2, 0);
  const bands = [-1, 1].map((x) => at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.02, height + size * 0.005, depth + size * 0.005), iron), x * width * 0.35, ground + height / 2, 0));
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb703, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 });
  const hoard = at(new THREE.Mesh(new THREE.SphereGeometry(width * 0.45, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold), 0, ground + height * 0.8, 0);
  hoard.scale.set(1, 0.35, depth / width);
  // The lid: half a cylinder hinged at the back edge.
  const hinge = at(new THREE.Group(), 0, ground + height, -depth / 2);
  const lidGeometry = new THREE.CylinderGeometry(depth / 2, depth / 2, width, 24, 1, false, 0, Math.PI);
  lidGeometry.rotateZ(Math.PI / 2);
  lidGeometry.rotateX(-Math.PI / 2);
  const lid = at(new THREE.Mesh(lidGeometry, wood), 0, 0, depth / 2);
  const lock = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.04, size * 0.05, size * 0.012), gold), 0, -size * 0.01, depth);
  hinge.add(lid, lock);
  const glow = new THREE.PointLight(0xffb703, 0, size * 1.2, 1.5);
  glow.position.set(0, ground + height + size * 0.1, 0);
  const sparkles = risers(16, {
    color: 0xfff3b0, size: size * 0.035, height: size * 0.35, speed: 0.6, opacity: 0.9, blending: THREE.AdditiveBlending,
    start: (i) => [Math.cos(i * 2.4) * width * 0.3, ground + height, Math.sin(i * 2.4) * depth * 0.3],
  });
  const { root } = standing(sand, box, ...bands, hoard, hinge, glow, sparkles.points);
  let open = true;
  let movedAt = -Infinity;
  let clock = 0;
  return {
    object: root,
    touch: () => {
      open = !open;
      movedAt = clock;
      return open ? "Opened" : "Closed";
    },
    animate: (t) => {
      clock = t;
      const k = Math.min(1, (t - movedAt) / 1.2);
      const openness = open ? k : 1 - k;
      hinge.rotation.x = -openness * 1.9;
      glow.intensity = 2.5 * openness;
      gold.emissiveIntensity = 0.3 + 0.6 * openness;
      sparkles.points.visible = openness > 0.5;
      sparkles.update(t);
    },
  };
}

// A rain cloud over a small meadow: rain falling from it, and after each shower a rainbow
// for a while. A tap brings thunder: a flash of lightning.
export function raincloud(size) {
  const meadow = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.45, size * 0.47, size * 0.03, 40), material(0x52b788)), 0, size * 0.015, 0);
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xced4da, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 });
  const cloud = new THREE.Group();
  for (const [x, y, z, r] of [[0, 0, 0, 0.12], [0.12, -0.02, 0.02, 0.09], [-0.12, -0.02, -0.01, 0.1], [0.05, 0.06, -0.03, 0.09], [-0.06, 0.05, 0.04, 0.08]]) {
    cloud.add(at(new THREE.Mesh(new THREE.SphereGeometry(size * r, 20, 14), cloudMaterial), x * size, y * size, z * size));
  }
  cloud.position.y = size * 0.62;
  const count = 70;
  const positions = new Float32Array(count * 6);
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  rainGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, size * 0.3, 0), size * 0.5);
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0x9ecbff, transparent: true, opacity: 0.8 }));
  // The rainbow: seven thin half rings, from red outside to violet inside.
  const rainbow = new THREE.Group();
  [0xff0000, 0xff7f00, 0xffff00, 0x00c000, 0x0000ff, 0x4b0082, 0x8f00ff].forEach((color, i) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(size * (0.36 - i * 0.018), size * 0.009, 6, 64, Math.PI), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    rainbow.add(band);
  });
  rainbow.position.set(0, size * 0.04, -size * 0.1);
  const flash = new THREE.PointLight(0xe0f0ff, 0, size * 2, 1.2);
  flash.position.y = size * 0.5;
  const bolt = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([[0, 0.55], [0.04, 0.42], [-0.02, 0.33], [0.05, 0.2], [0, 0.05]].map(([x, y]) => new THREE.Vector3(x * size, y * size, size * 0.05))),
    new THREE.LineBasicMaterial({ color: 0xfff9c4 }),
  );
  const { root } = standing(meadow, rainbow, rain, cloud, flash, bolt);
  let clock = 0;
  let thunderAt = -Infinity;
  return {
    object: root,
    touch: () => {
      thunderAt = clock;
      return "Thunder";
    },
    animate: (t) => {
      clock = t;
      // Twelve seconds of rain, then eight of rainbow.
      const phase = t % 20;
      const raining = phase < 12;
      rain.visible = raining;
      for (let i = 0; i < count; i++) {
        const fall = (t * 1.6 * (0.8 + (i % 4) * 0.1) + i / count) % 1;
        const angle = i * 2.39;
        const r = size * 0.18 * Math.sqrt((i * 0.618) % 1);
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const y = size * (0.55 - 0.5 * fall);
        positions.set([x, y, z, x, y - size * 0.04, z], i * 6);
      }
      rainGeometry.attributes.position.needsUpdate = true;
      const bow = raining ? 0 : Math.min(1, (phase - 12) / 1.5) * Math.min(1, (20 - phase) / 1.5);
      for (const band of rainbow.children) band.material.opacity = 0.75 * bow;
      cloud.position.x = size * 0.03 * Math.sin(t * 0.4);
      // Lightning: two quick flashes after a tap.
      const since = t - thunderAt;
      const lit = (since >= 0 && since < 0.12) || (since > 0.25 && since < 0.35);
      bolt.visible = lit;
      flash.intensity = lit ? 8 : 0;
      cloudMaterial.emissiveIntensity = lit ? 0.6 : 0;
      cloudMaterial.color.setHex(raining ? 0x9aa5b1 : 0xe9ecef);
    },
  };
}
