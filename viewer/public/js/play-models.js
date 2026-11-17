// Playful scenes on the watch: a volcano, a UFO after a cow, a toy train, a birthday
// cake. Loops of the time alone, from three.js's shapes; a tap sets each one off.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { risers } from "./nature-models.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...options });

function at(mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  return mesh;
}

// A volcano on an island: its crater glowing, smoke rising, and every fifteen seconds an
// eruption, glowing bombs thrown out in arcs and the glow flaring. A tap erupts it now.
export function volcano(size) {
  const height = size * 0.45;
  const sea = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.58, size * 0.58, size * 0.02, 48), material(0x1d5f8a, { roughness: 0.3 })), 0, size * 0.01, 0);
  // The cone: a lathe with a crater at the top.
  const outline = [
    [size * 0.5, 0], [size * 0.42, size * 0.04], [size * 0.28, height * 0.45], [size * 0.12, height * 0.95],
    [size * 0.1, height], [size * 0.07, height * 0.9],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cone = at(new THREE.Mesh(new THREE.LatheGeometry(outline, 40), material(0x5c4033, { flatShading: true })), 0, size * 0.02, 0);
  const lava = new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff3300, emissiveIntensity: 1.5 });
  const crater = at(new THREE.Mesh(new THREE.CircleGeometry(size * 0.075, 24), lava), 0, size * 0.02 + height * 0.9, 0);
  crater.rotation.x = -Math.PI / 2;
  // Lava streams down three flanks: each leaning in as the flank does, turned to its side.
  const slope = Math.atan2(size * 0.3, height * 0.85);
  const streams = [0.4, 2.3, 4.1].map((angle) => {
    const side = new THREE.Group();
    side.rotation.y = -angle;
    const stream = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.012, size * 0.028, height * 0.7, 6), lava), size * 0.27, size * 0.02 + height * 0.45, 0);
    stream.rotation.z = slope;
    side.add(stream);
    return side;
  });
  const smoke = risers(16, {
    color: 0xb0b0b0, size: size * 0.16, height: size * 0.5, speed: 0.25, opacity: 0.55,
    start: (i) => [Math.cos(i * 2.4) * size * 0.04, size * 0.02 + height, Math.sin(i * 2.4) * size * 0.04],
  });
  // The bombs: each on a parabola from the crater, glowing.
  const bombs = Array.from({ length: 14 }, (_, i) => {
    const bomb = new THREE.Mesh(new THREE.SphereGeometry(size * 0.018, 8, 6), lava);
    bomb.userData = { angle: i * 2.4, speed: 0.7 + ((i * 0.37) % 0.6), lift: 1 + ((i * 0.53) % 0.5) };
    return bomb;
  });
  const glow = new THREE.PointLight(0xff5a1f, 1, size * 3, 1.5);
  glow.position.y = height + size * 0.1;
  const { root } = standing(sea, cone, crater, ...streams, smoke.points, ...bombs, glow);
  let clock = 0;
  let shift = 0;
  return {
    object: root,
    touch: () => {
      const phase = (clock - shift) % 15;
      if (phase < 3) return null;
      shift = clock;
      return "Erupting";
    },
    animate: (t) => {
      clock = t;
      smoke.update(t);
      const phase = (((t - shift) % 15) + 15) % 15;
      const erupting = phase < 3;
      lava.emissiveIntensity = 1.2 + (erupting ? 1.5 * (1 - phase / 3) : 0.3 * Math.sin(t * 3));
      glow.intensity = erupting ? 1 + 6 * (1 - phase / 3) : 1;
      for (const bomb of bombs) {
        const { angle, speed, lift } = bomb.userData;
        const flight = phase * speed;
        bomb.visible = erupting && flight < 1.4;
        const reach = flight * size * 0.3;
        // Down to the sea, where it goes out.
        const y = size * 0.02 + height + (lift * 2.2 * flight - 1.9 * flight * flight) * size * 0.3;
        bomb.position.set(Math.cos(angle) * reach, Math.max(y, size * 0.04), Math.sin(angle) * reach);
        if (y < size * 0.04) bomb.visible = false;
      }
    },
  };
}

// A cow, nose toward +x: a white body with black patches, legs, a head with horns.
function cow(length) {
  const white = material(0xf8f9fa);
  const black = material(0x212529);
  const pink = material(0xf4a6b7);
  const group = new THREE.Group();
  const body = at(new THREE.Mesh(new THREE.BoxGeometry(length, length * 0.45, length * 0.42), white), 0, length * 0.55, 0);
  const patches = [[0.15, 0.2, 0.22], [-0.25, 0.1, -0.22], [-0.1, 0.3, 0.05]].map(([x, y, z]) =>
    at(new THREE.Mesh(new THREE.BoxGeometry(length * 0.25, length * 0.2, length * 0.02), black), x * length, length * 0.55 + y * length * 0.4, z * length * 1.0));
  const head = at(new THREE.Mesh(new THREE.BoxGeometry(length * 0.32, length * 0.3, length * 0.3), white), length * 0.6, length * 0.7, 0);
  const muzzle = at(new THREE.Mesh(new THREE.BoxGeometry(length * 0.1, length * 0.16, length * 0.26), pink), length * 0.8, length * 0.64, 0);
  const horns = [-1, 1].map((side) => at(new THREE.Mesh(new THREE.ConeGeometry(length * 0.03, length * 0.12, 6), material(0xe9d8a6)), length * 0.6, length * 0.9, side * length * 0.12));
  const legs = [[0.35, 0.15], [0.35, -0.15], [-0.35, 0.15], [-0.35, -0.15]].map(([x, z]) =>
    at(new THREE.Mesh(new THREE.BoxGeometry(length * 0.1, length * 0.34, length * 0.1), white), x * length, length * 0.17, z * length));
  group.add(body, ...patches, head, muzzle, ...horns, ...legs);
  return group;
}

// A UFO hovering over a meadow with a cow: every twelve seconds, after five quiet ones, its
// beam comes on, the cow floats up into it and is let down again, unharmed. A tap starts
// the beam.
export function ufo(size) {
  const meadow = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.5, size * 0.52, size * 0.03, 40), material(0x5aa64b)), 0, size * 0.015, 0);
  const animal = cow(size * 0.2);
  const hull = material(0xb8c4d0, { metalness: 0.8, roughness: 0.25 });
  const saucer = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(size * 0.22, 40, 16), hull);
  disc.scale.y = 0.22;
  const dome = at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.09, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0.6, roughness: 0.1 })), 0, size * 0.03, 0);
  const lights = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    return at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd23f, emissiveIntensity: 1 })), Math.cos(angle) * size * 0.2, 0, Math.sin(angle) * size * 0.2);
  });
  saucer.add(disc, dome, ...lights);
  const beamHeight = size * 0.62;
  const beamGeometry = new THREE.CylinderGeometry(size * 0.06, size * 0.17, beamHeight, 32, 1, true);
  const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: 0x9dff9d, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const { root } = standing(meadow, animal, saucer, beam);
  let clock = 0;
  let shift = 0;
  return {
    object: root,
    touch: () => {
      const phase = (((clock - shift) % 12) + 12) % 12;
      if (phase >= 5) return null;
      shift = clock - 5;
      return "Beam";
    },
    animate: (t) => {
      clock = t;
      const phase = (((t - shift) % 12) + 12) % 12;
      const hover = size * (0.72 + 0.03 * Math.sin(t * 1.7));
      saucer.position.set(size * 0.03 * Math.sin(t * 0.6), hover, size * 0.03 * Math.cos(t * 0.5));
      saucer.rotation.y = t * 1.5;
      lights.forEach((light, i) => (light.material.emissiveIntensity = (i + Math.floor(t * 8)) % 3 === 0 ? 2 : 0.3));
      // The beam for the last seven seconds: the cow rises for three, hangs, comes down.
      const beamed = phase - 5;
      const on = beamed >= 0;
      beam.visible = on;
      beam.position.set(saucer.position.x, hover - beamHeight / 2 - size * 0.02, saucer.position.z);
      beam.material.opacity = 0.18 + 0.08 * Math.sin(t * 12);
      const rise = on ? Math.min(1, beamed / 3) * Math.min(1, (7 - beamed) / 2) : 0;
      animal.position.set(saucer.position.x * rise, size * 0.03 + rise * size * 0.3, saucer.position.z * rise);
      animal.rotation.set(rise * 0.3 * Math.sin(t * 2), t * 0.2 + rise * t, rise * 0.25 * Math.cos(t * 2.3));
    },
  };
}

// A toy steam train going round a circular track: a locomotive puffing smoke and two
// cars. A tap blows the whistle: a burst of steam, and it speeds up for a while.
export function train(size) {
  const radius = size * 0.38;
  const ground = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.52, size * 0.54, size * 0.03, 48), material(0x6a994e)), 0, size * 0.015, 0);
  const steel = material(0x868e96, { metalness: 0.8, roughness: 0.3 });
  const rails = [-1, 1].map((side) => {
    const rail = at(new THREE.Mesh(new THREE.TorusGeometry(radius + side * size * 0.025, size * 0.004, 6, 96), steel), 0, size * 0.04, 0);
    rail.rotation.x = Math.PI / 2;
    return rail;
  });
  const sleepers = Array.from({ length: 36 }, (_, i) => {
    const angle = (i / 36) * Math.PI * 2;
    const sleeper = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.075, size * 0.008, size * 0.016), material(0x5c3d2e)), Math.cos(angle) * radius, size * 0.034, Math.sin(angle) * radius);
    sleeper.rotation.y = -angle;
    return sleeper;
  });
  // The cars, each built along +x (its direction of travel) and placed on the circle.
  const red = material(0xc92a2a, { roughness: 0.5 });
  const black = material(0x212529, { roughness: 0.5 });
  const gold = material(0xfab005, { metalness: 0.6, roughness: 0.3 });
  const wheels = (length) => [-1, 1].flatMap((x) => [-1, 1].map((z) => {
    const wheel = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.02, size * 0.02, size * 0.01, 12), black), x * length * 0.3, size * 0.06, z * size * 0.028);
    wheel.rotation.x = Math.PI / 2;
    return wheel;
  }));
  const engine = new THREE.Group();
  const boiler = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.035, size * 0.035, size * 0.11, 16), black), size * 0.02, size * 0.1, 0);
  boiler.rotation.z = Math.PI / 2;
  const cab = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.06, size * 0.08, size * 0.07), red), -size * 0.055, size * 0.12, 0);
  const chimney = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.016, size * 0.01, size * 0.05, 10), black), size * 0.06, size * 0.15, 0);
  const band = at(new THREE.Mesh(new THREE.TorusGeometry(size * 0.036, size * 0.004, 6, 16), gold), size * 0.05, size * 0.1, 0);
  band.rotation.y = Math.PI / 2;
  engine.add(boiler, cab, chimney, band, ...wheels(size * 0.16));
  const cars = [engine, ...[0x1971c2, 0x2f9e44].map((color) => {
    const car = new THREE.Group();
    car.add(at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.12, size * 0.06, size * 0.065), material(color, { roughness: 0.5 })), 0, size * 0.1, 0));
    car.add(...wheels(size * 0.14));
    return car;
  })];
  // Smoke from wherever the chimney is.
  const chimneyAt = new THREE.Vector3();
  const smoke = risers(14, {
    color: 0xf1f3f5, size: size * 0.09, height: size * 0.35, speed: 0.6, opacity: 0.8,
    start: (i) => [chimneyAt.x + Math.cos(i) * size * 0.01, size * 0.2, chimneyAt.z + Math.sin(i) * size * 0.01],
  });
  const { root } = standing(ground, ...rails, ...sleepers, ...cars, smoke.points);
  let clock = 0;
  let travelled = 0;
  let whistleAt = -Infinity;
  return {
    object: root,
    touch: () => {
      whistleAt = clock;
      return "Whistle";
    },
    animate: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      const boost = Math.max(0, 1 - (t - whistleAt) / 4);
      travelled += dt * (0.5 + 0.9 * boost);
      cars.forEach((car, i) => {
        const angle = travelled - i * 0.42;
        car.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        // Facing along the circle, counterclockwise seen from above.
        car.rotation.y = -angle - Math.PI / 2;
      });
      chimneyAt.set(size * 0.06, 0, 0).applyMatrix4(engine.matrix);
      smoke.points.material.size = size * (0.09 + 0.08 * boost);
      smoke.update(t * (1 + boost));
    },
  };
}

// A birthday cake: two tiers with icing and sprinkles, candles with flames that flicker.
// A tap blows them out, wisps of smoke rise, and they light again after a few seconds.
export function cake(size) {
  const plate = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.42, size * 0.42, size * 0.02, 48), material(0xf1f3f5, { roughness: 0.2 })), 0, size * 0.01, 0);
  const sponge = material(0xf4c38a);
  const icing = material(0xffc9de, { roughness: 0.4 });
  const lower = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.33, size * 0.33, size * 0.16, 48), sponge), 0, size * 0.1, 0);
  const lowerIcing = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.335, size * 0.335, size * 0.03, 48), icing), 0, size * 0.18, 0);
  const upper = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.22, size * 0.22, size * 0.13, 48), sponge), 0, size * 0.255, 0);
  const upperIcing = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.225, size * 0.225, size * 0.03, 48), icing), 0, size * 0.32, 0);
  const colors = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2];
  const sprinkles = Array.from({ length: 40 }, (_, i) => {
    const angle = i * 2.4;
    const r = size * (i % 2 ? 0.27 : 0.12) * (0.6 + ((i * 0.37) % 0.4));
    const y = i % 2 ? size * 0.196 : size * 0.336;
    const sprinkle = at(new THREE.Mesh(new THREE.CapsuleGeometry(size * 0.004, size * 0.012, 2, 4), material(colors[i % colors.length])), Math.cos(angle) * r, y, Math.sin(angle) * r);
    sprinkle.rotation.set(Math.PI / 2, 0, angle * 3);
    return sprinkle;
  });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const candles = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2;
    const group = at(new THREE.Group(), Math.cos(angle) * size * 0.14, size * 0.335, Math.sin(angle) * size * 0.14);
    const stick = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.01, size * 0.01, size * 0.09, 8), material(colors[i % colors.length], { roughness: 0.4 })), 0, size * 0.045, 0);
    const flame = at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.016, 10, 8), flameMaterial), 0, size * 0.11, 0);
    flame.scale.y = 1.8;
    group.add(stick, flame);
    return { group, flame, seed: i * 1.7 };
  });
  const light = new THREE.PointLight(0xffb347, 1.5, size * 2, 1.5);
  light.position.y = size * 0.5;
  const wisps = risers(12, {
    color: 0xdedede, size: size * 0.06, height: size * 0.3, speed: 0.4, opacity: 0.7,
    start: (i) => {
      const { group } = candles[i % candles.length];
      return [group.position.x, size * 0.44, group.position.z];
    },
  });
  const { root } = standing(plate, lower, lowerIcing, upper, upperIcing, ...sprinkles, ...candles.map(({ group }) => group), light, wisps.points);
  let clock = 0;
  let blownAt = -Infinity;
  return {
    object: root,
    touch: () => {
      if (clock - blownAt < 5) return null;
      blownAt = clock;
      return "Make a wish";
    },
    animate: (t) => {
      clock = t;
      const out = t - blownAt < 5;
      for (const { flame, seed } of candles) {
        flame.visible = !out;
        flame.scale.set(1 + 0.15 * Math.sin(t * 13 + seed), 1.8 + 0.4 * Math.sin(t * 17 + seed * 2), 1);
        flame.position.x = size * 0.004 * Math.sin(t * 9 + seed);
      }
      light.intensity = out ? 0 : 1.5 + 0.3 * Math.sin(t * 15);
      // The wisps start where the flames were, when they went out.
      wisps.points.visible = out;
      if (out) wisps.update(t - blownAt);
    },
  };
}
