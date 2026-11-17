// Wonders on the watch: a puzzle cube that scrambles and solves itself, and a black hole
// with its glowing disk. Built from three.js's shapes; a tap hurries the cube and feeds the
// black hole a star.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { dot } from "./dot.js";

// The cube's faces: +x, -x, +y, -y, +z, -z (three.js's box material order).
const FACE_COLORS = [0xb71234, 0xff5800, 0xffffff, 0xffd500, 0x009b48, 0x0046ad];
const MOVE_SECONDS = 0.4;
// Twelve moves to scramble it, the same each time: axis, layer and direction.
const SCRAMBLE = [
  ["x", 1, 1], ["y", -1, -1], ["z", 1, 1], ["x", -1, -1], ["y", 1, 1], ["z", -1, 1],
  ["x", 1, -1], ["y", 1, -1], ["z", 1, -1], ["x", -1, 1], ["y", -1, 1], ["z", -1, -1],
];

// A puzzle cube (a 3 by 3 by 3 twisting puzzle) standing on the watch: it scrambles itself in twelve turns, waits, turns
// them back one by one until it is solved, and starts over. A tap hurries it: three times
// as fast until it is solved.
export function puzzleCube(size) {
  const step = size * 0.12;
  const cubie = step * 0.94;
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const stickers = FACE_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.35 }));
  const cube = new THREE.Group();
  const cubies = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        // Colored only on the faces that are outside.
        const faces = [x === 1, x === -1, y === 1, y === -1, z === 1, z === -1].map((outside, i) => (outside ? stickers[i] : black));
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(cubie, cubie, cubie), faces);
        mesh.position.set(x * step, y * step, z * step);
        mesh.userData.home = mesh.position.clone();
        cube.add(mesh);
        cubies.push(mesh);
      }
    }
  }
  cube.position.y = step * 1.5 + size * 0.02;
  cube.rotation.y = Math.PI / 6;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.22, size * 0.02, 32), new THREE.MeshStandardMaterial({ color: 0x343a40, metalness: 0.4 }));
  stand.position.y = size * 0.01;
  const { root } = standing(stand, cube);
  const pivot = new THREE.Group();
  cube.add(pivot);

  // The program: the scramble, a pause, the scramble undone (reversed, each turn back).
  const moves = [...SCRAMBLE, null, null, null, ...[...SCRAMBLE].reverse().map(([axis, layer, direction]) => [axis, layer, -direction]), null, null, null, null];
  const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  // Turns `move` by `fraction` of a quarter turn: the layer's cubies into the pivot.
  const begin = ([axis, layer]) => {
    pivot.rotation.set(0, 0, 0);
    for (const mesh of cubies) {
      if (Math.round(mesh.position[axis] / step) === layer) pivot.attach(mesh);
    }
  };
  const turn = ([axis, , direction], fraction) => pivot.setRotationFromAxisAngle(AXES[axis], (direction * fraction * Math.PI) / 2);
  // A finished turn: the cubies back into the cube, snapped to the grid and to quarter turns.
  const settle = () => {
    for (const mesh of [...pivot.children]) {
      cube.attach(mesh);
      mesh.position.set(Math.round(mesh.position.x / step) * step, Math.round(mesh.position.y / step) * step, Math.round(mesh.position.z / step) * step);
      const e = new THREE.Matrix4().makeRotationFromQuaternion(mesh.quaternion).elements.map(Math.round);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().fromArray(e));
    }
    pivot.rotation.set(0, 0, 0);
  };
  let done = 0;
  let progress = 0;
  let clock = null;
  let hurry = false;
  return {
    object: root,
    touch: () => {
      hurry = true;
      return "Hurry";
    },
    animate: (t) => {
      const dt = clock === null ? 0 : Math.min(0.25, Math.max(0, t - clock));
      clock = t;
      progress += (dt / MOVE_SECONDS) * (hurry ? 3 : 1);
      // Every move whose time has come: finished at once if it was passed over.
      while (progress >= 1) {
        const move = moves[done % moves.length];
        if (move) {
          if (!pivot.children.length) begin(move);
          turn(move, 1);
          settle();
        }
        progress -= 1;
        done++;
        if (done % moves.length === 0) hurry = false;
      }
      const move = moves[done % moves.length];
      if (move) {
        if (!pivot.children.length) begin(move);
        turn(move, 1 - (1 - progress) ** 2);
      }
      cube.rotation.y = Math.PI / 6 + t * 0.15;
    },
  };
}

// A black hole floating over the watch: a black sphere, a thin ring of light around it,
// and a disk of glowing gas swirling in, faster near the middle, hotter (whiter) inside
// and redder out. A tap feeds it a star, which spirals in, stretched, and flares as it goes.
export function blackHole(size) {
  const center = size * 0.5;
  const horizon = size * 0.09;
  const hole = new THREE.Mesh(new THREE.SphereGeometry(horizon, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(horizon * 1.25, size * 0.006, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffd8a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  // The disk: points on circles, tilted a little, turning at Kepler's pace.
  const count = 1600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const angles = new Float32Array(count);
  const hot = new THREE.Color(0xfff4e0);
  const cool = new THREE.Color(0xff4d00);
  const mixed = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Spread evenly over the disk: radius and angle from the two halves of a
    // two-dimensional low-discrepancy sequence (R2), not from the same one, which would
    // put them all on one spiral. Denser toward the middle.
    const u = ((i * 0.5698402910) % 1) ** 1.6;
    radii[i] = horizon * (1.6 + 3.2 * u);
    angles[i] = ((i * 0.7548776662) % 1) * Math.PI * 2;
    mixed.copy(hot).lerp(cool, u);
    colors.set([mixed.r, mixed.g, mixed.b], i * 3);
  }
  const diskGeometry = new THREE.BufferGeometry();
  diskGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  diskGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  diskGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), horizon * 5);
  const disk = new THREE.Points(diskGeometry, new THREE.PointsMaterial({ size: size * 0.05, map: dot(), opacity: 0.7, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const star = new THREE.Mesh(new THREE.SphereGeometry(size * 0.025, 16, 12), new THREE.MeshBasicMaterial({ color: 0xbde0fe }));
  const system = new THREE.Group();
  system.position.y = center;
  system.rotation.x = 0.25;
  system.add(hole, ring, disk, star);
  // The ring stands upright facing the camera: the light bent round the hole's back.
  ring.onBeforeRender = (renderer, scene, camera) => ring.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.04, center - horizon * 1.6, 12), new THREE.MeshStandardMaterial({ color: 0x343a40, metalness: 0.5 }));
  base.position.y = (center - horizon * 1.6) / 2;
  const { root } = standing(base, system);
  let clock = 0;
  let fedAt = -Infinity;
  return {
    object: root,
    touch: () => {
      if (clock - fedAt < 3.5) return null;
      fedAt = clock;
      return "Fed a star";
    },
    animate: (t) => {
      clock = t;
      for (let i = 0; i < count; i++) {
        const r = radii[i];
        const angle = angles[i] + t * 0.9 * (horizon / r) ** 1.5 * 4;
        positions.set([Math.cos(angle) * r, Math.sin(i * 7.1) * size * 0.004, Math.sin(angle) * r], i * 3);
      }
      diskGeometry.attributes.position.needsUpdate = true;
      // The star: from the disk's edge in a tightening spiral, stretched along its way.
      // Before the first feeding, `since` is infinite: no star, nothing to place.
      const since = Math.min(t - fedAt, 10);
      star.visible = since >= 0 && since < 3;
      const k = Math.min(1, Math.max(0, since / 3));
      const r = horizon * (5 - 3.9 * k * k);
      const angle = since * (2 + 6 * k);
      star.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      star.scale.set(1 - 0.5 * k, 1 - 0.5 * k, 1 + 3 * k);
      star.lookAt(system.localToWorld(new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).add(star.position)));
      // The flare as it goes in, and the ring breathing.
      const flare = since > 2.6 && since < 3.6 ? Math.sin(((since - 2.6) / 1) * Math.PI) : 0;
      ring.material.opacity = 0.75 + 0.15 * Math.sin(t * 2) + 0.1 * flare;
      ring.scale.setScalar(1 + 0.25 * flare);
      disk.material.size = size * (0.05 + 0.03 * flare);
    },
  };
}
