// Time made visible: an open mechanical movement whose hands show the time now, and
// an hourglass that runs out every minute. From the clock alone.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";

// Angles on the dial, clockwise from 12 (the watch's top, -z), as a rotation about y.
const dial = (fraction) => -fraction * Math.PI * 2;

// A gear lying flat (in xz, its axis y): `teeth` teeth on a pitch radius `radius`,
// `thickness` high, with spokes cut out of larger ones.
function gear(radius, teeth, thickness, material) {
  const shape = new THREE.Shape();
  const depth = Math.min(radius * 0.18, (Math.PI * radius) / teeth);
  for (let i = 0; i < teeth * 4; i++) {
    const angle = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? radius + depth / 2 : radius - depth / 2;
    const point = [Math.cos(angle) * r, Math.sin(angle) * r];
    if (i === 0) shape.moveTo(...point);
    else shape.lineTo(...point);
  }
  shape.closePath();
  if (teeth >= 24) {
    // A large wheel gets four windows between spokes.
    for (let spoke = 0; spoke < 4; spoke++) {
      const hole = new THREE.Path();
      const from = (spoke / 4) * Math.PI * 2 + 0.25;
      const to = ((spoke + 1) / 4) * Math.PI * 2 - 0.25;
      hole.absarc(0, 0, radius * 0.72, from, to, false);
      hole.absarc(0, 0, radius * 0.3, to, from, true);
      shape.holes.push(hole);
    }
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 6 });
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  const jewel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.12, radius * 0.12, thickness * 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0xb0102a, roughness: 0.15, metalness: 0.2 }),
  );
  jewel.position.y = thickness / 2;
  const group = new THREE.Group();
  group.add(mesh, jewel);
  return group;
}

// A hand from the center toward -z, `length` long, tapering, its tip at the end.
function hand(length, width, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, length * 0.15);
  shape.lineTo(width / 2, length * 0.15);
  shape.lineTo(width * 0.2, -length);
  shape.lineTo(-width * 0.2, -length);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  // In xz: the shape's y becomes z.
  geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

// An open (skeleton) movement on the watch: the main plate, a gear train turning at
// the ratios of its teeth, the escape wheel stepping with each beat, the balance
// wheel swinging at 2.5 Hz (18,000 beats an hour, a classic rate) with its
// hairspring, and the hour, minute and second hands showing the time now, under a
// glass dome.
export function movement(size, { now }) {
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9b25f, metalness: 0.85, roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.9, roughness: 0.25 });
  const blued = new THREE.MeshStandardMaterial({ color: 0x1d3f9a, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide });
  const red = new THREE.MeshStandardMaterial({ color: 0xe0352b, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide });
  const radius = size * 0.5;
  const thick = size * 0.03;

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thick, 64), steel);
  plate.position.y = thick / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, thick * 0.6, 8, 64), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = thick;

  // The train: [x, z, pitch radius, teeth, turns per minute], each meshing with the
  // one before, so their speeds go inversely with their teeth and alternate in sense.
  const train = [
    [0, 0, 0.2, 40, 1 / 60],
    [-0.19, 0.17, 0.08, 16, -1 / 24],
    [-0.27, -0.06, 0.16, 32, 1 / 48],
    [0.22, -0.2, 0.12, 24, -0.5],
  ].map(([x, z, r, teeth, rate], i) => {
    const wheel = gear(r * size, teeth, thick * 0.8, brass);
    wheel.position.set(x * size, thick + i * thick * 0.15, z * size);
    return { wheel, rate };
  });

  // The escape wheel steps with each beat (5 a second).
  const escape = gear(size * 0.07, 15, thick * 0.6, steel);
  escape.position.set(size * 0.28, thick * 1.4, size * 0.12);

  // The balance: a ring with two spokes, and its hairspring, a flat spiral.
  const balance = new THREE.Group();
  const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(size * 0.11, size * 0.012, 8, 48), brass);
  ringMesh.rotation.x = Math.PI / 2;
  balance.add(ringMesh);
  for (const angle of [0, Math.PI / 2]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(size * 0.22, thick * 0.4, size * 0.012), brass);
    spoke.rotation.y = angle;
    balance.add(spoke);
  }
  const spiral = [];
  for (let i = 0; i <= 200; i++) {
    const angle = (i / 200) * Math.PI * 2 * 5;
    const r = size * (0.015 + (0.07 * i) / 200);
    spiral.push(new THREE.Vector3(Math.cos(angle) * r, thick * 0.3, Math.sin(angle) * r));
  }
  const hairspring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(spiral), new THREE.LineBasicMaterial({ color: 0x8fa3d9 }));
  balance.add(hairspring);
  balance.position.set(size * 0.2, thick * 2.2, size * 0.28);

  // The hands on a post above the center; the second hand sweeps in the beat's steps.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.02, size * 0.02, size * 0.16, 16), brass);
  post.position.y = thick + size * 0.08;
  const hours = hand(size * 0.26, size * 0.05, blued);
  const minutes = hand(size * 0.4, size * 0.04, blued);
  const seconds = hand(size * 0.44, size * 0.012, red);
  hours.position.y = thick + size * 0.12;
  minutes.position.y = thick + size * 0.14;
  seconds.position.y = thick + size * 0.16;

  // The crystal: a glass dome over it all, as on a watch's display back.
  const crystal = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false }),
  );
  crystal.scale.y = 0.6;
  crystal.position.y = thick;

  const { root } = standing(plate, rim, ...train.map(({ wheel }) => wheel), escape, balance, post, hours, minutes, seconds, crystal);
  return {
    object: root,
    animate: (t) => {
      const date = now();
      const beat = Math.floor((date.getMilliseconds() / 1000) * 5) / 5;
      const second = date.getSeconds() + beat;
      const minute = date.getMinutes() + second / 60;
      const hour = (date.getHours() % 12) + minute / 60;
      seconds.rotation.y = dial(second / 60);
      minutes.rotation.y = dial(minute / 60);
      hours.rotation.y = dial(hour / 12);
      const elapsed = date.getTime() / 60000;
      for (const { wheel, rate } of train) {
        wheel.rotation.y = dial((elapsed * rate) % 1);
      }
      escape.rotation.y = dial((Math.floor(t * 5) / 15) % 1);
      balance.rotation.y = 2.6 * Math.sin(t * Math.PI * 2 * 2.5);
    },
  };
}

// An hourglass on the watch that runs out every minute: the sand falls from the
// upper bulb into a growing pile below, and at the full minute the glass turns over
// in a second. Which bulb is up alternates with the minutes.
export function hourglass(size, { now }) {
  const half = size * 0.5;
  const bulb = size * 0.2;
  const neck = size * 0.02;
  // The glass's outline, from the bottom end to the top end, turned about y.
  const outline = [];
  for (let i = 0; i <= 32; i++) {
    const y = -half * 0.88 + (i / 32) * half * 1.76;
    const u = Math.abs(y) / (half * 0.88);
    // Narrow at the neck (u = 0), widest halfway, closing in toward the caps.
    outline.push(new THREE.Vector2(neck + (bulb - neck) * Math.sin(Math.PI * u * 0.9) ** 0.8, y));
  }
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(outline, 40),
    new THREE.MeshStandardMaterial({ color: 0xe6f4ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  );
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 0.6 });
  const caps = [-1, 1].map((end) => {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(bulb * 1.25, bulb * 1.25, size * 0.06, 32), wood);
    cap.position.y = end * (half * 0.88 + size * 0.03);
    return cap;
  });
  const pillars = [0, 1, 2].map((i) => {
    const angle = (i / 3) * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.018, size * 0.018, half * 1.76, 8), wood);
    pillar.position.set(Math.cos(angle) * bulb * 1.1, 0, Math.sin(angle) * bulb * 1.1);
    return pillar;
  });
  const sandColor = new THREE.MeshStandardMaterial({ color: 0xe8c07a, roughness: 0.9 });
  // The upper sand: a cone with its point in the neck; the lower: a pile on the bottom.
  const upper = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24), sandColor);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24), sandColor);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.005, size * 0.005, 1, 6), sandColor);
  const sand = new THREE.Group();
  sand.add(upper, lower, stream);

  const frame = new THREE.Group();
  frame.add(glass, ...caps, ...pillars, sand);
  const tilt = new THREE.Group();
  tilt.add(frame);
  tilt.position.y = half * 0.88 + size * 0.06;
  const { root } = standing(tilt);

  const ease = (k) => k * k * (3 - 2 * k);
  return {
    object: root,
    animate: () => {
      const date = now();
      const minute = Math.floor(date.getTime() / 60000);
      const second = (date.getTime() % 60000) / 1000;
      // The frame turns half a turn each minute, within its first second.
      const turning = second < 1;
      frame.rotation.z = Math.PI * (minute % 2) - (turning ? Math.PI * (1 - ease(second)) : 0);
      // The sand in the frame's own up (+1) or down: the bulb that is up now.
      const up = minute % 2 ? -1 : 1;
      sand.rotation.z = up === 1 ? 0 : Math.PI;
      const run = turning ? 0 : Math.min(1, (second - 1) / 58);
      const top = Math.cbrt(1 - run);
      const bottom = Math.cbrt(run);
      // While turning, everything is still in the bulb that is rising: the new upper one.
      upper.visible = top > 0.02;
      upper.scale.set(bulb * 0.85 * top, half * 0.6 * top, bulb * 0.85 * top);
      upper.rotation.x = Math.PI;
      upper.position.y = neck + (half * 0.6 * top) / 2 + (turning ? half * 0.88 - half * 0.6 - neck : 0);
      lower.visible = bottom > 0.02;
      lower.scale.set(bulb * 0.9, half * 0.45 * bottom, bulb * 0.9);
      lower.position.y = -half * 0.88 + (half * 0.45 * bottom) / 2;
      stream.visible = !turning && run < 1;
      const fall = half * 0.88 - half * 0.45 * bottom;
      stream.scale.y = fall;
      stream.position.y = -fall / 2;
    },
  };
}
