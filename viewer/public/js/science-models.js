// Science on the watch: an atom, a strand of DNA, a Newton's cradle and a metronome.
// Loops of the time alone, from three.js's shapes; a tap changes what they do.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { label } from "./label.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...options });

// A carbon atom, Bohr's picture: six protons and six neutrons packed in the nucleus, six
// electrons on three tilted orbits, glowing. A tap excites them: faster and brighter
// for three seconds.
export function atom(size) {
  const center = size * 0.5;
  const nucleus = new THREE.Group();
  const proton = material(0xe63946, { roughness: 0.35 });
  const neutron = material(0xadb5bd, { roughness: 0.35 });
  const nucleon = new THREE.SphereGeometry(size * 0.045, 16, 12);
  // Twelve points spread over a small ball (a golden spiral), alternating.
  for (let i = 0; i < 12; i++) {
    const y = 1 - (i + 0.5) / 6;
    const r = Math.sqrt(1 - y * y);
    const angle = i * 2.399963;
    const mesh = new THREE.Mesh(nucleon, i % 2 ? neutron : proton);
    mesh.position.set(Math.cos(angle) * r * size * 0.06, y * size * 0.06, Math.sin(angle) * r * size * 0.06);
    nucleus.add(mesh);
  }
  nucleus.position.y = center;
  const glow = new THREE.MeshStandardMaterial({ color: 0x9be7ff, emissive: 0x33c8ff, emissiveIntensity: 1 });
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x8ab4ff, transparent: true, opacity: 0.45 });
  const orbits = [0, 1, 2].map((k) => {
    const orbit = new THREE.Group();
    orbit.position.y = center;
    orbit.rotation.set(Math.PI / 2 + (k - 1) * 1.05, k * 0.9, 0);
    const radius = size * 0.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, size * 0.004, 6, 96), ringMaterial);
    ring.scale.y = 0.55;
    orbit.add(ring);
    const electrons = [0, 1].map((e) => {
      const electron = new THREE.Mesh(new THREE.SphereGeometry(size * 0.03, 16, 12), glow);
      electron.userData.phase = e * Math.PI + k;
      orbit.add(electron);
      return electron;
    });
    return { orbit, radius, electrons };
  });
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.02, center - size * 0.06, 8), material(0x495057));
  stand.position.y = (center - size * 0.06) / 2;
  const { root } = standing(stand, nucleus, ...orbits.map(({ orbit }) => orbit));
  let clock = 0;
  let excitedAt = -Infinity;
  let travelled = 0;
  return {
    object: root,
    touch: () => {
      excitedAt = clock;
      return "Excited";
    },
    animate: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      const excited = Math.max(0, 1 - (t - excitedAt) / 3);
      travelled += dt * (1.6 + 4 * excited);
      for (const { radius, electrons } of orbits) {
        for (const electron of electrons) {
          const angle = travelled + electron.userData.phase;
          electron.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.55, 0);
        }
      }
      glow.emissiveIntensity = 1 + 2 * excited;
      nucleus.rotation.y = t * 0.4;
      nucleus.scale.setScalar(1 + 0.04 * Math.sin(t * 9) * excited);
    },
  };
}

// The base pairs' colors: adenine with thymine, guanine with cytosine.
const BASES = { A: 0xff6b6b, T: 0xffd166, G: 0x06d6a0, C: 0x118ab2 };
const PAIRS = { A: "T", T: "A", G: "C", C: "G" };

// A strand of DNA standing on the watch: two backbones winding round each other, ten base
// pairs a turn, coloured by base, the helix turning. A tap unzips it in the middle for a
// moment, as when it is copied.
export function dna(size) {
  const height = size * 0.9;
  const radius = size * 0.13;
  const count = 24;
  const sequence = "ATGCGTACCTGAATCGGATCCTAG";
  const backbone = material(0xe9ecef, { roughness: 0.3, metalness: 0.2 });
  const helix = new THREE.Group();
  const rungs = [];
  for (let i = 0; i < count; i++) {
    const y = size * 0.06 + (i / (count - 1)) * height;
    const angle = (i / 10) * Math.PI * 2;
    const base = sequence[i % sequence.length];
    const pair = new THREE.Group();
    pair.position.y = y;
    pair.rotation.y = angle;
    // Each half of the rung toward the middle, a sugar at each end.
    const halves = [base, PAIRS[base]].map((letter, side) => {
      const half = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.012, size * 0.012, radius, 8), material(BASES[letter]));
      rod.rotation.z = Math.PI / 2;
      rod.position.x = radius / 2;
      const sugar = new THREE.Mesh(new THREE.SphereGeometry(size * 0.028, 12, 8), backbone);
      sugar.position.x = radius;
      half.add(rod, sugar);
      half.rotation.y = side * Math.PI;
      pair.add(half);
      return half;
    });
    helix.add(pair);
    rungs.push({ halves, y });
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.24, size * 0.04, 32), material(0x343a40));
  base.position.y = size * 0.02;
  const { root } = standing(base, helix);
  let clock = 0;
  let unzippedAt = -Infinity;
  return {
    object: root,
    touch: () => {
      if (clock - unzippedAt < 3) return null;
      unzippedAt = clock;
      return "Unzipped";
    },
    animate: (t) => {
      clock = t;
      helix.rotation.y = t * 0.5;
      // Unzipping: the halves near the middle part, most at the middle, and close again.
      const since = t - unzippedAt;
      const open = since < 3 ? Math.sin((since / 3) * Math.PI) : 0;
      for (const { halves, y } of rungs) {
        const near = Math.max(0, 1 - Math.abs(y - height / 2) / (height * 0.35));
        // Each half outward along its own rung: the second is turned half round.
        halves.forEach((half, side) => (half.position.x = (side ? -1 : 1) * open * near * radius * 0.9));
      }
    },
  };
}

// A Newton's cradle: five steel balls on strings in a frame. The outer ball swings in,
// strikes, and the one at the other end swings out, losing a little each time; it starts
// over every twenty seconds. A tap lifts one ball more (up to three), and starts it again.
export function newtonsCradle(size) {
  // Bright steel: without an environment to reflect, a true metal would look black.
  const steel = material(0xe9ecef, { metalness: 0.35, roughness: 0.2 });
  const frameMaterial = material(0x343a40, { metalness: 0.4 });
  const ball = size * 0.06;
  const length = size * 0.42;
  const top = size * 0.6;
  const frame = new THREE.Group();
  for (const z of [-1, 1]) {
    for (const x of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.008, size * 0.008, top, 8), frameMaterial);
      post.position.set(x * size * 0.3, top / 2, z * size * 0.1);
      frame.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.008, size * 0.008, size * 0.6, 8), frameMaterial);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, top, z * size * 0.1);
    frame.add(bar);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(size * 0.7, size * 0.04, size * 0.3), material(0x212529));
  plinth.position.y = size * 0.02;
  const wire = new THREE.LineBasicMaterial({ color: 0xadb5bd });
  const pendulums = [-2, -1, 0, 1, 2].map((k) => {
    const pivot = new THREE.Group();
    pivot.position.set(k * ball * 2, top, 0);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(ball, 24, 16), steel);
    sphere.position.y = -length;
    // Two strings, a V to the bars on either side.
    const strings = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -length, 0), new THREE.Vector3(0, 0, -size * 0.1),
        new THREE.Vector3(0, -length, 0), new THREE.Vector3(0, 0, size * 0.1),
      ]),
      wire,
    );
    pivot.add(sphere, strings);
    return pivot;
  });
  const { root } = standing(plinth, frame, ...pendulums);
  let lifted = 1;
  let startedAt = 0;
  let clock = 0;
  return {
    object: root,
    touch: () => {
      lifted = (lifted % 3) + 1;
      startedAt = clock;
      return lifted === 1 ? "One ball" : `${lifted} balls`;
    },
    animate: (t) => {
      clock = t;
      // The swing: half periods alternating left and right, the amplitude decaying.
      const since = (t - startedAt) % 20;
      const amplitude = 0.7 * Math.exp(-since * 0.08);
      const swing = amplitude * Math.sin(since * 3.2);
      pendulums.forEach((pivot, i) => {
        const left = i < lifted;
        const right = i >= pendulums.length - lifted;
        pivot.rotation.z = (swing < 0 && left) || (swing > 0 && right) ? swing : 0;
      });
    },
  };
}

const TEMPI = [60, 80, 96, 120, 144];

// A metronome: a wooden pyramid, the pendulum ticking to the tempo, the weight up its rod
// slower and down faster, a light flashing on each beat (no sound: the viewer has none).
// A tap sets the next tempo.
export function metronome(size) {
  const wood = material(0xa8673a, { roughness: 0.55 });
  const shape = new THREE.Shape();
  shape.moveTo(-size * 0.2, 0);
  shape.lineTo(size * 0.2, 0);
  shape.lineTo(size * 0.07, size * 0.7);
  shape.lineTo(-size * 0.07, size * 0.7);
  shape.closePath();
  const bodyGeometry = new THREE.ExtrudeGeometry(shape, { depth: size * 0.16, bevelEnabled: true, bevelSize: size * 0.01, bevelThickness: size * 0.01, bevelSegments: 2 });
  bodyGeometry.translate(0, size * 0.01, -size * 0.08);
  const body = new THREE.Mesh(bodyGeometry, wood);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.18, size * 0.55), material(0xf1e3c8));
  face.position.set(0, size * 0.33, size * 0.092);
  // The pendulum: a rod from a pivot low on the face, the sliding weight on it.
  const pivot = new THREE.Group();
  pivot.position.set(0, size * 0.1, size * 0.1);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.006, size * 0.62, 8), material(0xced4da, { metalness: 0.8, roughness: 0.2 }));
  rod.position.y = size * 0.31;
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.04, size * 0.04, size * 0.05, 6), material(0xd4af37, { metalness: 0.8, roughness: 0.25 }));
  pivot.add(rod, weight);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(size * 0.025, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff2020, emissiveIntensity: 0 }));
  lamp.position.set(0, size * 0.66, size * 0.09);
  const text = label(size * 0.7);
  text.sprite.position.set(0, size * 0.9, 0);
  const { root } = standing(body, face, pivot, lamp, text.sprite);
  let tempo = 2;
  let clock = 0;
  let beats = 0;
  return {
    object: root,
    touch: () => {
      tempo = (tempo + 1) % TEMPI.length;
      return `${TEMPI[tempo]} a minute`;
    },
    animate: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      const bpm = TEMPI[tempo];
      // A swing to one side and back is two beats.
      beats += (dt * bpm) / 60;
      const phase = beats % 2;
      pivot.rotation.z = 0.45 * Math.sin(phase * Math.PI);
      lamp.material.emissiveIntensity = beats % 1 < 0.12 ? 2.5 : 0;
      // The weight higher for slower tempi.
      weight.position.y = size * (0.5 - ((bpm - 60) / 84) * 0.25);
      text.update([`♩ = ${bpm}`]);
    },
  };
}
