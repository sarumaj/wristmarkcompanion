// Living things on the watch: a jellyfish drifting and pulsing, butterflies over a patch
// of flowers. Loops of the time alone, from three.js's shapes; a tap startles them.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...options });

// A jellyfish: a translucent glowing bell that pulses, frilly arms and long tentacles
// trailing and waving, drifting up with each pulse and sinking between. A tap makes it
// pulse hard and shoot up.
export function jellyfish(size) {
  const rocks = Array.from({ length: 7 }, (_, i) => {
    const angle = i * 2.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size * (0.05 + 0.02 * (i % 3)), 0), material(0x5c677d, { flatShading: true }));
    rock.position.set(Math.cos(angle) * size * 0.25, size * 0.03, Math.sin(angle) * size * 0.25);
    rock.scale.y = 0.6;
    return rock;
  });
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.42, size * 0.45, size * 0.02, 40), material(0xc2b280, { roughness: 1 }));
  sand.position.y = size * 0.01;
  const glow = 0xff7ad9;
  const bellMaterial = new THREE.MeshStandardMaterial({ color: 0xffb3ec, emissive: glow, emissiveIntensity: 0.6, transparent: true, opacity: 0.65, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(size * 0.16, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), bellMaterial);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(size * 0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe0f5, emissive: glow, emissiveIntensity: 1.2 }));
  inner.position.y = size * 0.04;
  // Tentacles: lines whose points wave, each from the bell's rim down.
  const count = 12;
  const segments = 14;
  const tentacleLength = size * 0.42;
  const tentacles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const positions = new Float32Array((segments + 1) * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: i % 3 ? 0xffc6f1 : 0xffffff, transparent: true, opacity: 0.8 }));
    return { line, positions, geometry, angle, length: tentacleLength * (i % 3 ? 1 : 0.6) };
  });
  const body = new THREE.Group();
  body.add(bell, inner, ...tentacles.map(({ line }) => line));
  const { root } = standing(sand, ...rocks, body);
  let clock = 0;
  let height = size * 0.6;
  let velocity = 0;
  let dartAt = -Infinity;
  return {
    object: root,
    touch: () => {
      dartAt = clock;
      velocity += size * 0.9;
      return "Swim";
    },
    animate: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      // A pulse every 1.6 seconds (quicker after a tap): the bell squeezes, it rises.
      const quick = t - dartAt < 2;
      const rate = quick ? 1.6 : 0.6;
      const pulse = Math.max(0, Math.sin(t * Math.PI * rate)) ** 3;
      bell.scale.set(1 - 0.25 * pulse, 1 + 0.15 * pulse, 1 - 0.25 * pulse);
      velocity += (pulse * size * 0.35 - size * 0.12 - velocity * 0.8) * dt;
      height = Math.min(size * 0.8, Math.max(size * 0.55, height + velocity * dt));
      if (height <= size * 0.55 || height >= size * 0.8) velocity *= 0.5;
      body.position.set(Math.sin(t * 0.3) * size * 0.06, height, Math.cos(t * 0.23) * size * 0.06);
      body.rotation.y = t * 0.2;
      bellMaterial.emissiveIntensity = 0.5 + 0.8 * pulse;
      // The tentacles hang from the rim, waving more the further down.
      for (const { positions, geometry, angle, length } of tentacles) {
        for (let k = 0; k <= segments; k++) {
          const along = k / segments;
          const sway = Math.sin(t * 2 - along * 4 + angle) * along * size * 0.05;
          const r = size * 0.13 * (1 - 0.3 * pulse) * (1 - along * 0.5);
          positions.set([Math.cos(angle) * r + sway, -along * length * (1 - 0.15 * pulse), Math.sin(angle) * r + sway * 0.5], k * 3);
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeBoundingSphere();
      }
    },
  };
}

// A butterfly's wing: a rounded shape, both wings of one side in one.
function wingShape(span) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(span * 0.3, span * 0.5, span * 0.9, span * 0.55, span, span * 0.2);
  shape.bezierCurveTo(span * 0.95, 0, span * 0.6, -0.05 * span, span * 0.45, -0.05 * span);
  shape.bezierCurveTo(span * 0.7, -0.3 * span, span * 0.5, -0.55 * span, span * 0.25, -0.45 * span);
  shape.bezierCurveTo(span * 0.1, -0.35 * span, 0, -0.1 * span, 0, 0);
  return new THREE.ShapeGeometry(shape, 12);
}

// Butterflies fluttering over a patch of flowers, each on its own looping path, wings
// beating, now and then settling on a flower. A tap scatters them up and away for a
// moment.
export function butterflies(size) {
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.5, size * 0.52, size * 0.03, 40), material(0x588157));
  grass.position.y = size * 0.015;
  const petals = [0xff70a6, 0xffd670, 0xe9ff70, 0xff9770, 0xc77dff];
  const flowers = Array.from({ length: 9 }, (_, i) => {
    const flower = new THREE.Group();
    const angle = i * 2.4;
    const r = size * (0.12 + 0.3 * ((i * 0.37) % 1));
    const height = size * (0.12 + 0.06 * (i % 3));
    flower.position.set(Math.cos(angle) * r, size * 0.03, Math.sin(angle) * r);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.005, size * 0.005, height, 5), material(0x2d6a4f));
    stem.position.y = height / 2;
    const bloom = new THREE.Group();
    bloom.position.y = height;
    for (let p = 0; p < 6; p++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(size * 0.022, 8, 6), material(petals[i % petals.length]));
      petal.scale.set(1, 0.3, 0.6);
      petal.position.set(Math.cos((p / 6) * Math.PI * 2) * size * 0.025, 0, Math.sin((p / 6) * Math.PI * 2) * size * 0.025);
      bloom.add(petal);
    }
    bloom.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.014, 8, 6), material(0xffb703)));
    flower.add(stem, bloom);
    return flower;
  });
  const colors = [[0xff8c00, 0x1a1a1a], [0x4cc9f0, 0x1d3557], [0xf9f871, 0x6a4c93]];
  const flock = colors.map(([color, edge], i) => {
    const span = size * 0.13;
    const wing = wingShape(span);
    const wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(wing, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, side: THREE.DoubleSide, roughness: 0.7 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.x = side;
      pivot.add(mesh);
      return pivot;
    });
    const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(size * 0.006, span * 0.5, 2, 6), material(edge));
    bodyMesh.rotation.x = Math.PI / 2;
    const butterfly = new THREE.Group();
    butterfly.add(bodyMesh, ...wings);
    return { butterfly, wings, phase: i * 2.1, speed: 0.35 + i * 0.07 };
  });
  const { root } = standing(grass, ...flowers, ...flock.map(({ butterfly }) => butterfly));
  let clock = 0;
  let scaredAt = -Infinity;
  return {
    object: root,
    touch: () => {
      scaredAt = clock;
      return "Scattered";
    },
    animate: (t) => {
      clock = t;
      const scared = Math.max(0, 1 - (t - scaredAt) / 3);
      for (const { butterfly, wings, phase, speed } of flock) {
        const u = t * speed + phase;
        // A looping path over the patch, higher and wider when scared.
        const x = Math.sin(u) * size * (0.28 + 0.15 * scared);
        const z = Math.sin(u * 1.7 + 1) * size * (0.22 + 0.15 * scared);
        const y = size * (0.3 + 0.08 * Math.sin(u * 2.3) + 0.35 * scared);
        butterfly.position.set(x, y, z);
        // Heading along the path.
        const dx = Math.cos(u) * (0.28 + 0.15 * scared);
        const dz = Math.cos(u * 1.7 + 1) * 1.7 * (0.22 + 0.15 * scared);
        butterfly.rotation.y = Math.atan2(dx, dz);
        const beat = Math.sin(t * (18 + 12 * scared) + phase) * 0.9;
        wings[0].rotation.z = beat;
        wings[1].rotation.z = -beat;
      }
      flowers.forEach((flower, i) => (flower.rotation.z = 0.05 * Math.sin(t * 1.3 + i)));
    },
  };
}
