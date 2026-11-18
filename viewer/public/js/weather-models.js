// A rain cloud over a meadow: twelve seconds of rain, drops splashing and a puddle
// growing, flowers closed; then the cloud drifts aside, the sun comes out, the flowers
// open and a rainbow draws itself across the sky, for eight. A loop of the time alone; a tap
// brings lightning, a shake of the wrist a downpour.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { dot } from "./dot.js";

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
const clamp = (k) => Math.min(1, Math.max(0, k));
const smooth = (k) => clamp(k) * clamp(k) * (3 - 2 * clamp(k));

const CYCLE = 20;
const RAIN = 12;

// The rainbow: a half ring standing on the meadow, red outside to violet inside, drawn as far
// as `share` (0 to 1) from its left foot.
function rainbowGeometry(inner, outer, share) {
  const geometry = new THREE.RingGeometry(inner, outer, Math.max(2, Math.round(48 * share)), 7, Math.PI - Math.PI * share, Math.PI * share);
  const colors = [];
  const position = geometry.attributes.position;
  const bands = [0xe63946, 0xf77f00, 0xfcbf49, 0x52b788, 0x4895ef, 0x5e60ce, 0x9d4edd].map((hex) => new THREE.Color(hex));
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getY(i));
    const k = clamp((outer - r) / (outer - inner)) * (bands.length - 1);
    const color = bands[Math.floor(k)].clone().lerp(bands[Math.min(bands.length - 1, Math.floor(k) + 1)], k % 1);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// A jagged bolt from the cloud to the ground, with a branch: new each strike.
function boltGeometry(size, seed, from, to) {
  const points = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const jag = i === 0 || i === steps ? 0 : (random(seed + i) - 0.5) * size * 0.07;
    points.push(new THREE.Vector3(from.x + (to.x - from.x) * k + jag, from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k + jag * 0.5));
  }
  const fork = points[3].clone();
  const branch = [fork, fork.clone().add(new THREE.Vector3(size * 0.06 * (random(seed + 20) > 0.5 ? 1 : -1), -size * 0.08, size * 0.02)), fork.clone().add(new THREE.Vector3(size * 0.09 * (random(seed + 20) > 0.5 ? 1 : -1), -size * 0.15, 0))];
  const tube = (list, radius) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(list, false, "catmullrom", 0.1), list.length * 4, radius, 5, false);
  return { main: tube(points, size * 0.005), branch: tube(branch, size * 0.0035), glow: tube(points, size * 0.016) };
}

export function raincloud(size) {
  const ground = size * 0.03;
  const meadow = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.46, size * 0.48, ground, 48), material(0x52b788)), 0, ground / 2, 0);
  const earth = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.48, size * 0.45, size * 0.02, 48), material(0x6f4e37)), 0, -size * 0.008, 0);

  // Grass: tufts of thin blades over the meadow, in two greens, swaying.
  const blades = 130;
  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(size * 0.006, size * 0.036, 4),
    // A light of its own: the blades' sides face the camera, which the scene's lights leave dark.
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1b5e3a, emissiveIntensity: 0.9 }),
    blades,
  );
  const greens = [new THREE.Color(0x74c69d), new THREE.Color(0x95d5b2), new THREE.Color(0x52b788)];
  const tufts = [];
  for (let i = 0; i < blades; i++) {
    const angle = random(i) * Math.PI * 2;
    const r = size * 0.44 * Math.sqrt(random(i + 300));
    tufts.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r, h: 0.6 + 0.6 * random(i + 600), lean: (random(i + 900) - 0.5) * 0.5 });
    grass.setColorAt(i, greens[i % 3]);
  }

  // Flowers: a stem, a heart and five petals that close in the rain.
  const flowers = [];
  [[0xff70a6, -0.28, 0.12], [0xffd166, 0.3, 0.18], [0xffffff, -0.12, 0.3], [0x9d4edd, 0.18, -0.28], [0xff9770, -0.32, -0.18], [0xffd166, 0.05, 0.36], [0xff70a6, 0.36, -0.05]].forEach(([color, x, z], i) => {
    const flower = at(new THREE.Group(), x * size, ground, z * size);
    const stem = size * (0.06 + 0.02 * random(i));
    flower.add(at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.003, size * 0.003, stem, 5), material(0x40916c, { emissive: 0x1b5e3a, emissiveIntensity: 0.8 })), 0, stem / 2, 0));
    const head = at(new THREE.Group(), 0, stem, 0);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.009, 8, 6), material(0xffb703)));
    const petals = [];
    for (let p = 0; p < 5; p++) {
      const holder = new THREE.Group();
      holder.rotation.y = (p / 5) * Math.PI * 2;
      const petal = at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.012, 8, 6), material(color)), size * 0.014, 0, 0);
      petal.scale.set(1.3, 0.35, 0.8);
      const hinge = new THREE.Group();
      hinge.add(petal);
      holder.add(hinge);
      head.add(holder);
      petals.push(hinge);
    }
    flower.add(head);
    flowers.push({ head, petals });
  });

  // The puddle, which grows while it rains and dries in the sun.
  const puddleMaterial = new THREE.MeshStandardMaterial({ color: 0x6c9bd2, metalness: 0.5, roughness: 0.1, transparent: true, opacity: 0.85 });
  const puddle = at(new THREE.Mesh(new THREE.CircleGeometry(size * 0.12, 32), puddleMaterial), size * 0.06, ground + size * 0.002, size * 0.05);
  puddle.rotation.x = -Math.PI / 2;
  puddle.scale.y = 0.7;

  // The cloud: puffs, light on top and grey beneath, each breathing a little.
  const top = material(0xf1f3f5, { emissive: 0xffffff, emissiveIntensity: 0, roughness: 1 });
  const belly = material(0xadb5bd, { emissive: 0xffffff, emissiveIntensity: 0, roughness: 1 });
  const cloud = at(new THREE.Group(), 0, size * 0.62, 0);
  const puffs = [
    [0, 0.03, 0, 0.13, top], [0.12, 0.0, 0.03, 0.1, top], [-0.13, 0.0, -0.01, 0.105, top], [0.05, 0.1, -0.03, 0.09, top],
    [-0.06, 0.09, 0.04, 0.085, top], [0.2, -0.03, -0.02, 0.07, top], [-0.21, -0.03, 0.02, 0.07, top], [0.02, 0.02, 0.1, 0.09, top],
    [0, -0.06, 0, 0.12, belly], [0.12, -0.07, 0.02, 0.09, belly], [-0.12, -0.07, -0.01, 0.09, belly], [0.03, -0.06, -0.09, 0.08, belly],
  ].map(([x, y, z, r, surface], i) => {
    const puff = at(new THREE.Mesh(new THREE.SphereGeometry(size * r, 20, 14), surface), x * size, y * size, z * size);
    // The underside flat, as a rain cloud's is.
    if (surface === belly) puff.scale.y = 0.55;
    puff.userData = { base: puff.scale.clone(), phase: random(i) * 6 };
    cloud.add(puff);
    return puff;
  });
  const inner = new THREE.PointLight(0xdfe9ff, 0, size * 0.6, 1.5);
  cloud.add(inner);

  // The rain: short streaks falling from the cloud's underside, splashing as rings.
  const drops = 90;
  const rainMaterial = new THREE.MeshBasicMaterial({ color: 0xa9d6ff, transparent: true, opacity: 0.75, depthWrite: false });
  const rain = new THREE.InstancedMesh(new THREE.CylinderGeometry(size * 0.0018, size * 0.0018, size * 0.045, 4), rainMaterial, drops);
  rain.frustumCulled = false;
  const splashGeometry = new THREE.RingGeometry(size * 0.006, size * 0.01, 12);
  splashGeometry.rotateX(-Math.PI / 2);
  const splashes = new THREE.InstancedMesh(splashGeometry, new THREE.MeshBasicMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), drops);
  splashes.frustumCulled = false;
  const fall = Array.from({ length: drops }, (_, i) => {
    const angle = random(i + 50) * Math.PI * 2;
    const r = size * 0.2 * Math.sqrt(random(i + 80));
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r, speed: 1.4 + 0.5 * random(i + 110), offset: random(i + 140), share: random(i + 170) };
  });

  // The sun, behind the cloud until the rain stops; rays turning round it.
  const sun = new THREE.Group();
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  sun.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.06, 20, 14), sunMaterial));
  const rays = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const ray = at(new THREE.Mesh(new THREE.ConeGeometry(size * 0.012, size * 0.045, 4), sunMaterial), 0, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.z = (i / 10) * Math.PI * 2;
    ray.position.y = size * 0.09;
    holder.add(ray);
    rays.add(holder);
  }
  sun.add(rays);
  const haloGeometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const haloMaterial = new THREE.PointsMaterial({ color: 0xffe8a3, size: size * 0.4, map: dot(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  sun.add(new THREE.Points(haloGeometry, haloMaterial));
  const sunlight = new THREE.PointLight(0xfff1c1, 0, size * 2, 1.2);
  sun.add(sunlight);

  // The rainbow behind the meadow's middle, and the lightning.
  const inner_ = size * 0.29;
  const outer = size * 0.37;
  const rainbowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const rainbow = at(new THREE.Mesh(rainbowGeometry(inner_, outer, 1), rainbowMaterial), 0, ground, -size * 0.12);
  let drawn = 1;
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
  const boltGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x9bb8ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const bolt = new THREE.Group();
  const flash = new THREE.PointLight(0xdfe9ff, 0, size * 2.5, 1.2);
  flash.position.y = size * 0.4;

  const { root } = standing(earth, meadow, grass, ...flowers.map((flower) => flower.head.parent), puddle, splashes, rain, rainbow, sun, cloud, bolt, flash);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let clock = 0;
  // Where the cycle starts (a shake starts a shower now), when the last downpour and strike were.
  let start = 0;
  let pouredAt = -Infinity;
  let struckAt = -Infinity;
  let strikes = 0;
  let lastPhase = 0;
  const strike = (t) => {
    struckAt = t;
    strikes++;
    for (const child of [...bolt.children]) {
      bolt.remove(child);
      child.geometry.dispose();
    }
    const from = new THREE.Vector3(cloud.position.x + (random(strikes) - 0.5) * size * 0.12, cloud.position.y - size * 0.07, (random(strikes + 7) - 0.5) * size * 0.08);
    const to = new THREE.Vector3(from.x + (random(strikes + 3) - 0.5) * size * 0.15, ground, from.z + (random(strikes + 5) - 0.5) * size * 0.1);
    const geometry = boltGeometry(size, strikes * 31, from, to);
    bolt.add(new THREE.Mesh(geometry.glow, boltGlowMaterial), new THREE.Mesh(geometry.main, boltMaterial), new THREE.Mesh(geometry.branch, boltMaterial));
  };
  return {
    object: root,
    touch: () => {
      strike(clock);
      return "Thunder";
    },
    // A shake of the wrist wrings the cloud out: a downpour, at once.
    gesture: (event) => {
      if (event.name !== "shake") return false;
      pouredAt = clock;
      const phase = (((clock - start) % CYCLE) + CYCLE) % CYCLE;
      if (phase >= RAIN - 2) start = clock - 0.5;
      return true;
    },
    animate: (t) => {
      clock = t;
      const phase = (((t - start) % CYCLE) + CYCLE) % CYCLE;
      // How hard it rains (0 to 1): in over a second, out over two; a downpour doubles it.
      const pour = Math.exp(-Math.max(0, t - pouredAt) / 4);
      const rainfall = phase < RAIN ? smooth(phase / 1) * smooth((RAIN - phase) / 2) : 0;
      const clear = phase < RAIN ? smooth((phase - RAIN + 1.5) / 1.5) : smooth((phase - RAIN) / 2) * smooth((CYCLE - phase) / 1.5);
      // One strike of its own in each shower.
      if (lastPhase < 6 && phase >= 6 && t - struckAt > 2) strike(t);
      lastPhase = phase;

      // The cloud: dark and low over the rain, light and drifting aside in the sun.
      cloud.position.x = size * (0.02 * Math.sin(t * 0.4) + 0.12 * clear);
      cloud.position.y = size * (0.62 + 0.05 * clear + 0.01 * Math.sin(t * 0.7));
      top.color.setHex(0xf8f9fa).lerp(new THREE.Color(0x8d99ae), 0.6 * (1 - clear));
      belly.color.setHex(0xdee2e6).lerp(new THREE.Color(0x495057), (1 - clear) * (0.8 + 0.2 * pour));
      for (const puff of puffs) {
        const breath = 1 + 0.04 * Math.sin(t * 0.8 + puff.userData.phase);
        puff.scale.copy(puff.userData.base).multiplyScalar(breath);
      }

      // The drops: falling, then a ring where each lands; more of them in a downpour.
      const share = Math.min(1, rainfall * (0.6 + 0.8 * pour));
      fall.forEach((drop, i) => {
        const k = (t * drop.speed * (1 + 0.5 * pour) + drop.offset) % 1;
        const falling = drop.share < share;
        const x = drop.x + cloud.position.x;
        const top_ = cloud.position.y - size * 0.06;
        // The first 85% of the cycle falling, the rest splashing.
        const f = k / 0.85;
        if (falling && f < 1) {
          position.set(x, top_ + (ground - top_) * f, drop.z);
          scale.set(1, 1, 1);
        } else scale.set(0, 0, 0);
        matrix.compose(position, quaternion.identity(), scale);
        rain.setMatrixAt(i, matrix);
        const s = falling && f >= 1 ? (k - 0.85) / 0.15 : 0;
        position.set(x, ground + size * 0.003, drop.z);
        scale.setScalar(s > 0 ? 0.5 + 2 * s : 0);
        matrix.compose(position, quaternion.identity(), scale);
        splashes.setMatrixAt(i, matrix);
      });
      rain.instanceMatrix.needsUpdate = true;
      splashes.instanceMatrix.needsUpdate = true;

      // The meadow: the puddle grows while it rains and dries; the grass sways, bent by the
      // rain; the flowers close in it and open in the sun.
      const wet = phase < RAIN ? smooth(phase / RAIN) : 1 - smooth((phase - RAIN) / (CYCLE - RAIN));
      puddle.scale.set(0.35 + 0.75 * wet, 0.25 + 0.5 * wet, 1);
      puddleMaterial.opacity = 0.3 + 0.55 * wet;
      tufts.forEach((tuft, i) => {
        euler.set(tuft.lean + 0.08 * Math.sin(t * 1.5 + i) + 0.15 * rainfall, 0, 0.08 * Math.sin(t * 1.1 + i * 0.7));
        matrix.compose(position.set(tuft.x, ground + size * 0.018 * tuft.h, tuft.z), quaternion.setFromEuler(euler), scale.set(1, tuft.h, 1));
        grass.setMatrixAt(i, matrix);
      });
      grass.instanceMatrix.needsUpdate = true;
      flowers.forEach((flower, i) => {
        const openness = 0.15 + 0.85 * clear;
        for (const petal of flower.petals) petal.rotation.z = (1 - openness) * 1.2;
        flower.head.rotation.x = 0.1 * Math.sin(t * 1.2 + i) + 0.3 * rainfall;
      });

      // The sun: up from behind the cloud as it clears, and its rainbow drawn left to right.
      sun.position.set(-size * 0.24, size * (0.55 + 0.2 * clear), -size * 0.2);
      sun.scale.setScalar(Math.max(0.001, clear));
      sun.visible = clear > 0.02;
      rays.rotation.z = t * 0.3;
      haloMaterial.opacity = 0.5 * clear;
      sunlight.intensity = 1.5 * clear;
      const bow = phase < RAIN ? 0 : smooth((phase - RAIN - 0.8) / 1.8);
      const fade = phase < RAIN ? 0 : smooth((CYCLE - phase) / 1.5);
      if (Math.abs(bow - drawn) > 0.01) {
        drawn = bow;
        rainbow.geometry.dispose();
        rainbow.geometry = rainbowGeometry(inner_, outer, Math.max(0.01, bow));
      }
      rainbowMaterial.opacity = 0.8 * Math.min(1, bow * 4) * fade;
      rainbow.visible = bow > 0 && fade > 0;

      // Lightning: two flashes in a third of a second.
      const since = t - struckAt;
      const lit = (since >= 0 && since < 0.1) || (since > 0.2 && since < 0.32);
      bolt.visible = lit;
      flash.intensity = lit ? 10 : 0;
      inner.intensity = since >= 0 && since < 0.45 ? 4 * (1 - since / 0.45) : 0;
      // White in the sun, lit from inside by the lightning.
      top.emissiveIntensity = lit ? 0.5 : 0.3 * clear;
      belly.emissiveIntensity = lit ? 0.5 : 0.15 * clear;
    },
  };
}
