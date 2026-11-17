// The fair on the watch: a carousel, a race track, a lava lamp. Loops of the time alone,
// from three.js's shapes; a tap speeds them up or changes them.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { label } from "./label.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...options });

function at(mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  return mesh;
}

// A small horse, facing +x: body, neck and head, legs, a tail.
function horse(length, color) {
  const coat = material(color, { roughness: 0.4 });
  const dark = material(0x3d2b1f);
  const group = new THREE.Group();
  group.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(length * 0.17, length * 0.45, 4, 10).rotateZ(Math.PI / 2), coat), 0, 0, 0));
  const neck = at(new THREE.Mesh(new THREE.CylinderGeometry(length * 0.08, length * 0.11, length * 0.35, 8), coat), length * 0.36, length * 0.2, 0);
  neck.rotation.z = -0.6;
  const head = at(new THREE.Mesh(new THREE.BoxGeometry(length * 0.3, length * 0.13, length * 0.13), coat), length * 0.52, length * 0.34, 0);
  head.rotation.z = -0.4;
  const mane = at(new THREE.Mesh(new THREE.BoxGeometry(length * 0.05, length * 0.3, length * 0.05), dark), length * 0.3, length * 0.28, 0);
  mane.rotation.z = -0.6;
  // Galloping: front legs reaching forward, hind legs back.
  const legs = [[0.22, 0.6], [-0.22, -0.6]].flatMap(([x, angle]) => [-1, 1].map((side) => {
    const leg = at(new THREE.Mesh(new THREE.CylinderGeometry(length * 0.035, length * 0.03, length * 0.32, 6), coat), x * length, -length * 0.22, side * length * 0.08);
    leg.rotation.z = angle;
    return leg;
  }));
  const tail = at(new THREE.Mesh(new THREE.ConeGeometry(length * 0.05, length * 0.3, 6), dark), -length * 0.42, -length * 0.02, 0);
  tail.rotation.z = -2.4;
  group.add(neck, head, mane, ...legs, tail);
  return group;
}

// A carousel: a striped roof with lights round its edge, brass poles and six horses going
// up and down as it turns. A tap makes it go faster for a while.
export function carousel(size) {
  const radius = size * 0.38;
  const base = at(new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.08, radius * 1.12, size * 0.05, 48), material(0x7b2cbf)), 0, size * 0.025, 0);
  const deck = at(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, size * 0.02, 48), material(0xf1e3c8)), 0, size * 0.06, 0);
  // The roof: a cone of gores in alternating colors, through vertex colors.
  const roofGeometry = new THREE.ConeGeometry(radius * 1.15, size * 0.22, 24, 1);
  const colors = [];
  const position = roofGeometry.attributes.position;
  const red = new THREE.Color(0xe63946);
  const white = new THREE.Color(0xf8f9fa);
  for (let i = 0; i < position.count; i++) {
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    const gore = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 12);
    const color = gore % 2 ? red : white;
    colors.push(color.r, color.g, color.b);
  }
  roofGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const roof = at(new THREE.Mesh(roofGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true })), 0, size * 0.66, 0);
  const brass = material(0xd4af37, { metalness: 0.7, roughness: 0.3 });
  const center = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.05, size * 0.05, size * 0.5, 16), material(0xffd166)), 0, size * 0.3, 0);
  const rotor = new THREE.Group();
  const lights = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const light = at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd23f, emissiveIntensity: 1 })), Math.cos(angle) * radius * 1.12, size * 0.55, Math.sin(angle) * radius * 1.12);
    rotor.add(light);
    lights.push(light);
  }
  const coats = [0xf8f9fa, 0x8d5524, 0x212529, 0xc68b59, 0xf8f9fa, 0x6c757d];
  const riders = coats.map((coat, i) => {
    const angle = (i / coats.length) * Math.PI * 2;
    const x = Math.cos(angle) * radius * 0.75;
    const z = Math.sin(angle) * radius * 0.75;
    rotor.add(at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.006, size * 0.5, 6), brass), x, size * 0.31, z));
    const mount = horse(size * 0.16, coat);
    mount.position.set(x, size * 0.25, z);
    // Facing along the way round.
    mount.rotation.y = -angle - Math.PI / 2;
    rotor.add(mount);
    return { mount, i };
  });
  rotor.add(roof, deck);
  const { root } = standing(base, center, rotor);
  let clock = 0;
  let turned = 0;
  let fastAt = -Infinity;
  return {
    object: root,
    touch: () => {
      fastAt = clock;
      return "Faster";
    },
    animate: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      const fast = Math.max(0, 1 - (t - fastAt) / 5);
      turned += dt * (0.5 + 1.2 * fast);
      rotor.rotation.y = turned;
      for (const { mount, i } of riders) mount.position.y = size * (0.25 + 0.06 * Math.sin(turned * 3 + i * 2.1));
      lights.forEach((light, i) => (light.material.emissiveIntensity = (i + Math.floor(t * 6)) % 4 === 0 ? 2 : 0.6));
    },
  };
}

// A race car, facing +x: a low body, a cockpit, wheels, a rear wing, its number.
function car(length, color) {
  const paint = material(color, { roughness: 0.35, metalness: 0.3 });
  const black = material(0x1b1b1b);
  const group = new THREE.Group();
  group.add(at(new THREE.Mesh(new THREE.BoxGeometry(length, length * 0.14, length * 0.36), paint), 0, length * 0.13, 0));
  const nose = at(new THREE.Mesh(new THREE.ConeGeometry(length * 0.12, length * 0.3, 4), paint), length * 0.6, length * 0.11, 0);
  nose.rotation.z = -Math.PI / 2;
  group.add(nose);
  group.add(at(new THREE.Mesh(new THREE.SphereGeometry(length * 0.1, 12, 8), material(0x111827, { roughness: 0.1 })), -length * 0.05, length * 0.24, 0));
  group.add(at(new THREE.Mesh(new THREE.BoxGeometry(length * 0.08, length * 0.04, length * 0.5), paint), -length * 0.48, length * 0.3, 0));
  group.add(at(new THREE.Mesh(new THREE.BoxGeometry(length * 0.04, length * 0.12, length * 0.04), black), -length * 0.45, length * 0.22, 0));
  for (const x of [-0.32, 0.32]) {
    for (const z of [-1, 1]) {
      const wheel = at(new THREE.Mesh(new THREE.CylinderGeometry(length * 0.1, length * 0.1, length * 0.08, 14), black), x * length, length * 0.1, z * length * 0.22);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
    }
  }
  return group;
}

// A race on an oval track: two cars, red and blue, lap after lap, each a little faster on
// some laps; a label counts the laps and says who leads. A tap gives the red one a boost.
export function raceTrack(size) {
  const straight = size * 0.36;
  const bend = size * 0.2;
  const asphalt = material(0x343a40, { roughness: 0.9 });
  const infield = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.56, size * 0.58, size * 0.03, 48), material(0x52b788)), 0, size * 0.015, 0);
  infield.scale.z = 0.72;
  // The track: a flat band along the oval, built from a shape with a hole.
  const oval = (r) => {
    const shape = new THREE.Shape();
    shape.absarc(straight / 2, 0, r, -Math.PI / 2, Math.PI / 2, false);
    shape.absarc(-straight / 2, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
    return shape;
  };
  const band = oval(bend + size * 0.07);
  band.holes.push(oval(bend - size * 0.07));
  const trackGeometry = new THREE.ShapeGeometry(band, 24);
  trackGeometry.rotateX(-Math.PI / 2);
  const track = at(new THREE.Mesh(trackGeometry, asphalt), 0, size * 0.032, 0);
  const finish = at(new THREE.Mesh(new THREE.PlaneGeometry(size * 0.02, size * 0.14), material(0xf8f9fa)), 0, size * 0.034, bend);
  finish.rotation.x = -Math.PI / 2;
  // A point on the oval's middle line, `lane` out from it, at distance `s` along it, and
  // the heading (a turn about y from +x).
  const length = 2 * straight + 2 * Math.PI * bend;
  const along = (s, lane) => {
    const d = ((s % length) + length) % length;
    const r = bend + lane;
    if (d < straight) return { x: -straight / 2 + d, z: r, heading: 0 };
    if (d < straight + Math.PI * bend) {
      const a = (d - straight) / bend;
      return { x: straight / 2 + Math.sin(a) * r, z: Math.cos(a) * r, heading: a };
    }
    if (d < 2 * straight + Math.PI * bend) return { x: straight / 2 - (d - straight - Math.PI * bend), z: -r, heading: Math.PI };
    const a = (d - 2 * straight - Math.PI * bend) / bend;
    return { x: -straight / 2 - Math.sin(a) * r, z: -Math.cos(a) * r, heading: Math.PI + a };
  };
  const racers = [
    { car: car(size * 0.16, 0xd00000), lane: size * 0.03, base: 1.0, name: "Red" },
    { car: car(size * 0.16, 0x0353a4), lane: -size * 0.03, base: 1.02, name: "Blue" },
  ];
  for (const racer of racers) racer.covered = 0;
  const text = label(size * 0.8);
  text.sprite.position.set(0, size * 0.45, 0);
  const { root } = standing(infield, track, finish, ...racers.map(({ car: mesh }) => mesh), text.sprite);
  let clock = 0;
  let boostAt = -Infinity;
  return {
    object: root,
    touch: () => {
      boostAt = clock;
      return "Boost";
    },
    animate: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      const boost = Math.max(0, 1 - (t - boostAt) / 2);
      racers.forEach((racer, i) => {
        // Each a little faster on some laps: a slow wave, so the lead changes.
        const lap = racer.covered / length;
        const pace = racer.base * (1 + 0.06 * Math.sin(lap * 2.3 + i * 2)) * (i === 0 ? 1 + 0.8 * boost : 1);
        racer.covered += dt * size * 0.45 * pace;
        const { x, z, heading } = along(racer.covered, racer.lane);
        racer.car.position.set(x, size * 0.032, z);
        racer.car.rotation.y = heading;
      });
      const [red, blue] = racers;
      const lap = Math.floor(Math.max(red.covered, blue.covered) / length) + 1;
      text.update([`Lap ${lap}`, `${red.covered >= blue.covered ? red.name : blue.name} leads`]);
    },
  };
}

const LAVA = [
  { glass: 0xff006e, blobs: 0xffbe0b, name: "Sunset" },
  { glass: 0x3a86ff, blobs: 0x8338ec, name: "Ocean" },
  { glass: 0x06d6a0, blobs: 0xfffb00, name: "Lime" },
];

// A lava lamp: a tapered glass on a metal base, glowing, blobs of wax rising and sinking
// slowly, stretching as they go. A tap changes its colors.
export function lavaLamp(size) {
  const metal = material(0xadb5bd, { metalness: 0.7, roughness: 0.3 });
  const base = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.08, size * 0.15, size * 0.18, 32), metal), 0, size * 0.09, 0);
  const cap = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.035, size * 0.06, size * 0.1, 32), metal), 0, size * 0.85, 0);
  const outline = [[0.08, 0.18], [0.13, 0.35], [0.12, 0.6], [0.06, 0.8]].map(([r, y]) => new THREE.Vector2(r * size, y * size));
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false });
  const glass = new THREE.Mesh(new THREE.LatheGeometry(outline, 40), glassMaterial);
  const waxMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.3 });
  const blobs = Array.from({ length: 6 }, (_, i) => {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(size * (0.035 + 0.01 * (i % 3)), 16, 12), waxMaterial);
    blob.userData = { phase: i * 1.3, speed: 0.12 + 0.03 * (i % 3), angle: i * 2.1 };
    return blob;
  });
  const pool = at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.08, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), waxMaterial), 0, size * 0.18, 0);
  const light = new THREE.PointLight(0xffffff, 1, size * 1.5, 1.5);
  light.position.y = size * 0.45;
  const { root } = standing(base, glass, cap, pool, ...blobs, light);
  let scheme = 0;
  const paint = () => {
    const { glass: glassColor, blobs: blobColor } = LAVA[scheme];
    glassMaterial.color.setHex(glassColor);
    glassMaterial.emissive.setHex(glassColor);
    waxMaterial.color.setHex(blobColor);
    waxMaterial.emissive.setHex(blobColor);
    light.color.setHex(glassColor);
  };
  paint();
  return {
    object: root,
    touch: () => {
      scheme = (scheme + 1) % LAVA.length;
      paint();
      return LAVA[scheme].name;
    },
    animate: (t) => {
      for (const blob of blobs) {
        const { phase, speed, angle } = blob.userData;
        // Up and down the glass, slowest at the ends, a little round the middle.
        const k = 0.5 - 0.5 * Math.cos(t * speed * Math.PI * 2 + phase);
        const y = size * (0.24 + 0.5 * k);
        // Within the glass's radius at that height.
        const r = size * 0.035 * Math.sin(t * 0.3 + phase);
        blob.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
        const stretch = 1 + 0.5 * Math.abs(Math.sin(t * speed * Math.PI * 2 + phase));
        blob.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      }
      glassMaterial.emissiveIntensity = 0.35 + 0.05 * Math.sin(t * 0.7);
    },
  };
}
