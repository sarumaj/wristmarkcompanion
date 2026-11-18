// Places and things on the watch: a castle and a snowman. Loops of the time alone, from
// three.js's shapes; a tap lowers the drawbridge or tips the hat. (The house, the treasure
// chest and the rain cloud have files of their own.)
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { dot } from "./dot.js";

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
