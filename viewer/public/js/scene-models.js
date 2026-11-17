// Little scenes on the watch: a windmill in a tulip field, a sailboat on the waves, a
// Ferris wheel lit at night, a bonsai through the seasons. Loops of the time alone, from
// three.js's shapes; the Ferris wheel and the bonsai read the clock and the date.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { dot } from "./dot.js";
import { label } from "./label.js";

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...options });

function at(mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  return mesh;
}

// A Dutch windmill on a green mound among tulips, its four sails turning in the wind,
// which picks up now and then. A tap brings a gust.
export function windmill(size) {
  const grass = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.6, size * 0.04, 48), material(0x4f9d3a)), 0, size * 0.02, 0);
  const tower = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.1, size * 0.16, size * 0.55, 8), material(0x8a5a3c)), 0, size * 0.04 + size * 0.275, 0);
  const cap = at(new THREE.Mesh(new THREE.ConeGeometry(size * 0.13, size * 0.16, 8), material(0x3b3f46)), 0, size * 0.67, 0);
  const door = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.05, size * 0.08, size * 0.01), material(0x3b2414)), 0, size * 0.08, size * 0.145);
  // The sails: four lattice blades on a hub at the cap's front, toward the watch's bottom.
  const hub = at(new THREE.Group(), 0, size * 0.6, size * 0.13);
  // Lit from either side: the sails face away from the light as often as toward it.
  const sailcloth = material(0xf2efe6, { side: THREE.DoubleSide, emissive: 0x6b675e });
  const frame = material(0x5a3a24);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / 4) * Math.PI * 2;
    arm.add(at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.015, size * 0.4, size * 0.015), frame), 0, size * 0.2, 0));
    arm.add(at(new THREE.Mesh(new THREE.PlaneGeometry(size * 0.09, size * 0.3), sailcloth), size * 0.05, size * 0.24, 0));
    hub.add(arm);
  }
  hub.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.025, 12, 8), frame));
  // Tulips in rows of colors around it.
  const colors = [0xe63946, 0xffb703, 0xf72585, 0xffffff];
  const tulips = new THREE.Group();
  const stem = material(0x2d6a2d);
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    const radius = size * (0.3 + 0.12 * (i % 2));
    const flower = new THREE.Group();
    flower.add(at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.004, size * 0.004, size * 0.05, 4), stem), 0, size * 0.025, 0));
    flower.add(at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.018, 8, 6), material(colors[Math.floor(i / 9) % colors.length])), 0, size * 0.055, 0));
    flower.position.set(Math.cos(angle) * radius, size * 0.04, Math.sin(angle) * radius);
    tulips.add(flower);
  }
  const { root } = standing(grass, tower, cap, door, hub, tulips);
  let clock = 0;
  let gustAt = -Infinity;
  let turned = 0;
  return {
    object: root,
    touch: () => {
      gustAt = clock;
      return "Gust";
    },
    animate: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      // The wind: a breeze that swells every twenty seconds, and a gust after a tap.
      const gust = Math.max(0, 1 - (t - gustAt) / 3);
      const wind = 0.8 + 0.4 * Math.sin(t * 0.3) ** 2 + 2.5 * gust;
      turned += wind * dt;
      hub.rotation.z = -turned;
      tulips.children.forEach((flower, i) => (flower.rotation.z = 0.12 * wind * Math.sin(t * 2.5 + i)));
    },
  };
}

// A sailboat sailing in circles on a patch of sea, heeling in the wind and rocking on
// the waves. A tap makes it come about: it turns and sails the other way round.
export function sailboat(size) {
  const segments = 40;
  // Rings of vertices, not a fan from the center, so that the waves have somewhere to be.
  const seaGeometry = new THREE.RingGeometry(0.001, size * 0.55, segments * 2, 14);
  seaGeometry.rotateX(-Math.PI / 2);
  const rest = seaGeometry.attributes.position.array.slice();
  const sea = at(new THREE.Mesh(seaGeometry, material(0x2a7fc4, { roughness: 0.3 })), 0, size * 0.04, 0);
  // The hull: a half sphere stretched long, its deck flat on top.
  const hullGeometry = new THREE.SphereGeometry(size * 0.08, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const hull = new THREE.Mesh(hullGeometry, material(0xffffff, { roughness: 0.4, side: THREE.DoubleSide }));
  hull.scale.set(0.9, 0.8, 2.4);
  const deck = new THREE.Mesh(new THREE.CircleGeometry(size * 0.08, 24), material(0xb07a45));
  deck.rotation.x = -Math.PI / 2;
  deck.scale.set(0.9, 2.4, 1);
  const mast = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.005, size * 0.006, size * 0.42, 6), material(0x5a3a24)), 0, size * 0.21, -size * 0.03);
  // The mainsail and the jib: triangles from the mast.
  const triangle = (points, color) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material(color, { side: THREE.DoubleSide, roughness: 0.9 }));
  };
  const main = triangle([[0, size * 0.4, -size * 0.03], [0, size * 0.04, -size * 0.03], [0, size * 0.04, size * 0.16]], 0xf8f4e8);
  const jib = triangle([[0, size * 0.36, -size * 0.035], [0, size * 0.04, -size * 0.18], [0, size * 0.04, -size * 0.04]], 0xe63946);
  const boat = new THREE.Group();
  boat.add(hull, deck, mast, main, jib);
  boat.scale.setScalar(1.5);
  const heel = new THREE.Group();
  heel.add(boat);
  const course = new THREE.Group();
  course.add(heel);
  const { root } = standing(sea, course);
  let clock = 0;
  let direction = 1;
  let angle = 0;
  let turnAt = -Infinity;
  return {
    object: root,
    touch: () => {
      if (clock - turnAt < 2) return null;
      turnAt = clock;
      direction = -direction;
      return "Coming about";
    },
    animate: (t) => {
      const dt = Math.min(0.1, Math.max(0, t - clock));
      clock = t;
      // The waves: rings of sines over the patch, the flat-shaded facets catching light.
      const position = seaGeometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const x = rest[i * 3];
        const z = rest[i * 3 + 2];
        position.setY(i, size * 0.012 * (Math.sin(x * 0.35 + t * 2) + Math.sin(z * 0.28 - t * 1.6)));
      }
      position.needsUpdate = true;
      seaGeometry.computeVertexNormals();
      // Round a circle, either way; coming about takes two seconds, the boat turning.
      const turning = Math.min(1, (t - turnAt) / 2);
      angle += direction * 0.35 * dt * (turning < 1 ? 0.3 : 1);
      const radius = size * 0.28;
      // Afloat: the hull's keel just above the watch, its lower half under the waves.
      heel.position.set(Math.cos(angle) * radius, size * 0.12 + size * 0.008 * Math.sin(t * 2.2), Math.sin(angle) * radius);
      const ahead = -angle + (direction > 0 ? 0 : Math.PI);
      boat.rotation.y = ahead + (turning < 1 ? Math.PI * (1 - turning) : 0);
      heel.rotation.z = 0;
      // Heeling away from the wind, rocking with the waves.
      boat.rotation.z = direction * (0.25 + 0.05 * Math.sin(t * 1.3)) * (turning < 1 ? Math.abs(1 - 2 * turning) : 1);
      boat.rotation.x = 0.06 * Math.sin(t * 2.2);
    },
  };
}

// A Ferris wheel on the watch: eight gondolas hanging level as it turns, and the rim's
// lights, on after dark (the viewer's clock, 18 to 7 o'clock) and chasing; a tap turns
// them on for a few seconds by day.
export function ferrisWheel(size, { now }) {
  const radius = size * 0.4;
  const hubHeight = size * 0.56;
  const steel = material(0xd9dee6, { metalness: 0.6, roughness: 0.3 });
  const red = material(0xe63946);
  const base = at(new THREE.Mesh(new THREE.BoxGeometry(size * 0.5, size * 0.04, size * 0.24), material(0x50565f)), 0, size * 0.02, 0);
  // The A-frames on either side of the wheel (toward +z and -z).
  const legs = [];
  for (const z of [-1, 1]) {
    for (const x of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.01, size * 0.012, hubHeight * 1.06, 8), steel);
      leg.position.set(x * size * 0.1, hubHeight / 2 + size * 0.02, z * size * 0.07);
      leg.rotation.z = x * Math.atan2(size * 0.2, hubHeight);
      legs.push(leg);
    }
  }
  const wheel = at(new THREE.Group(), 0, hubHeight, 0);
  for (const z of [-1, 1]) {
    wheel.add(at(new THREE.Mesh(new THREE.TorusGeometry(radius, size * 0.008, 8, 64), steel), 0, 0, z * size * 0.05));
  }
  const lights = [];
  const lamp = new THREE.SphereGeometry(size * 0.009, 8, 6);
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const light = new THREE.Mesh(lamp, new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffd23f, emissiveIntensity: 0 }));
    light.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, size * 0.06);
    wheel.add(light);
    lights.push(light);
  }
  const gondolas = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.004, size * 0.004, radius, 4), steel);
    spoke.position.set((Math.cos(angle) * radius) / 2, (Math.sin(angle) * radius) / 2, 0);
    spoke.rotation.z = angle - Math.PI / 2;
    wheel.add(spoke);
    const gondola = new THREE.Group();
    gondola.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    const cabin = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.035, size * 0.03, size * 0.05, 12), i % 2 ? red : material(0x2a9df4)), 0, -size * 0.04, 0);
    const roof = at(new THREE.Mesh(new THREE.ConeGeometry(size * 0.04, size * 0.025, 12), material(0xffffff)), 0, -size * 0.003, 0);
    gondola.add(cabin, roof);
    wheel.add(gondola);
    gondolas.push(gondola);
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.02, size * 0.02, size * 0.16, 12).rotateX(Math.PI / 2), steel));
  const { root } = standing(base, ...legs, wheel);
  let clock = 0;
  let litUntil = -Infinity;
  return {
    object: root,
    touch: () => {
      litUntil = clock + 6;
      return "Lights";
    },
    animate: (t) => {
      clock = t;
      wheel.rotation.z = -t * 0.25;
      // The gondolas hang: turned back by the wheel's turn.
      for (const gondola of gondolas) gondola.rotation.z = -wheel.rotation.z;
      const hour = now().getHours();
      const lit = hour >= 18 || hour < 7 || t < litUntil;
      lights.forEach((light, i) => {
        light.material.emissiveIntensity = lit ? 0.6 + 1.4 * (Math.sin(t * 6 - i * 0.8) > 0.3 ? 1 : 0) : 0;
      });
    },
  };
}

// The season at `date` (meteorological, northern hemisphere).
export function season(date) {
  const month = date.getMonth();
  return ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"][month];
}

const SEASONS = {
  spring: { leaves: 0x8fd16a, blossom: 0xffb7d5, falling: 0xffc8de, title: "Spring" },
  summer: { leaves: 0x2f8f3a, blossom: null, falling: null, title: "Summer" },
  autumn: { leaves: 0xe07a1f, blossom: 0xc0392b, falling: 0xe8912d, title: "Autumn" },
  winter: { leaves: null, blossom: null, falling: 0xffffff, title: "Winter" },
};

// A bonsai in a pot, as the season is today: blossoms in spring, full green in summer,
// orange leaves falling in autumn, bare branches with snow in winter (?date= shows the
// others). A tap shakes it: petals, leaves or snow come down.
export function bonsai(size, { now }) {
  const pot = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.22, size * 0.17, size * 0.1, 6), material(0x7a3b2e, { roughness: 0.5 })), 0, size * 0.05, 0);
  const soil = at(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.2, size * 0.01, 6), material(0x3a2a1e)), 0, size * 0.1, 0);
  const bark = material(0x5b3a24, { roughness: 0.9 });
  // The trunk and branches: tubes along curves, from the soil up and out.
  const tube = (points, radius) =>
    new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x * size, y * size, z * size))), 24, radius * size, 8), bark);
  const trunk = tube([[0, 0.1, 0], [0.05, 0.2, 0], [-0.03, 0.32, 0.02], [0.02, 0.45, 0]], 0.03);
  const branches = [
    [[0.03, 0.27, 0], [0.15, 0.32, 0.03], [0.24, 0.36, 0.05]],
    [[-0.02, 0.34, 0.01], [-0.14, 0.4, -0.02], [-0.22, 0.42, -0.05]],
    [[0.01, 0.42, 0], [0.06, 0.5, 0.08], [0.1, 0.55, 0.12]],
  ].map((points) => tube(points, 0.012));
  // The crowns at the branches' ends and the top: clusters of facets.
  const crowns = [[0.24, 0.4, 0.05, 0.11], [-0.22, 0.46, -0.05, 0.1], [0.1, 0.58, 0.12, 0.09], [0.02, 0.5, 0, 0.12]];
  const look = () => SEASONS[season(now())];
  let shown = look();
  const foliage = new THREE.MeshStandardMaterial({ color: shown.leaves ?? 0xffffff, roughness: 0.8, flatShading: true });
  const blossoms = new THREE.MeshStandardMaterial({ color: shown.blossom ?? 0xffffff, roughness: 0.6 });
  const crownGroup = new THREE.Group();
  const blossomGroup = new THREE.Group();
  for (const [x, y, z, r] of crowns) {
    const crown = at(new THREE.Mesh(new THREE.IcosahedronGeometry(r * size, 1), foliage), x * size, y * size, z * size);
    crown.scale.set(1, 0.55, 1);
    crownGroup.add(crown);
    for (let k = 0; k < 9; k++) {
      const angle = k * 2.4;
      blossomGroup.add(at(new THREE.Mesh(new THREE.SphereGeometry(size * 0.022, 8, 6), blossoms), (x + Math.cos(angle) * r * 0.8) * size, (y + r * 0.35) * size, (z + Math.sin(angle) * r * 0.8) * size));
    }
  }
  // Falling: petals, leaves or snowflakes, from the crowns to the ground in a loop.
  const count = 30;
  const positions = new Float32Array(count * 3);
  const fallGeometry = new THREE.BufferGeometry();
  fallGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  fallGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, size * 0.3, 0), size * 0.6);
  const fallMaterial = new THREE.PointsMaterial({ color: shown.falling ?? 0xffffff, size: size * 0.035, map: dot(), transparent: true, depthWrite: false });
  const falling = new THREE.Points(fallGeometry, fallMaterial);
  const text = label(size * 0.8);
  text.sprite.position.set(0, size * 0.78, -size * 0.2);
  const { root } = standing(pot, soil, trunk, ...branches, crownGroup, blossomGroup, falling, text.sprite);
  const dress = () => {
    shown = look();
    crownGroup.visible = shown.leaves !== null;
    if (shown.leaves !== null) foliage.color.setHex(shown.leaves);
    blossomGroup.visible = shown.blossom !== null;
    if (shown.blossom !== null) blossoms.color.setHex(shown.blossom);
    // Winter's crowns: snow on the bare branches' ends.
    if (shown.leaves === null) {
      crownGroup.visible = true;
      foliage.color.setHex(0xf4f8ff);
    }
    fallMaterial.color.setHex(shown.falling ?? 0xffffff);
    const date = now();
    text.update([shown.title, date.toLocaleDateString("en", { day: "numeric", month: "long" })]);
  };
  dress();
  let clock = 0;
  let shakenAt = -Infinity;
  let dressed = 0;
  return {
    object: root,
    touch: () => {
      shakenAt = clock;
      return "Shaken";
    },
    animate: (t) => {
      clock = t;
      if (Math.abs(t - dressed) > 60) {
        dressed = t;
        dress();
      }
      // Something falls in autumn and winter, and for a few seconds after a shake.
      const shaken = t - shakenAt < 4;
      falling.visible = (shown.falling !== null && shown.title !== "Spring" && shown.title !== "Summer") || (shaken && shown.falling !== null);
      for (let i = 0; i < count; i++) {
        const life = (t * 0.12 * (0.8 + (i % 5) * 0.1) + i / count) % 1;
        const [x, , z, r] = crowns[i % crowns.length];
        const angle = i * 2.1;
        positions.set([
          (x + Math.cos(angle) * r) * size + Math.sin(t * 1.5 + i) * size * 0.03,
          size * (0.5 - life * 0.45),
          (z + Math.sin(angle) * r) * size,
        ], i * 3);
      }
      fallGeometry.attributes.position.needsUpdate = true;
      const sway = shaken ? 0.06 * Math.sin(t * 18) * (1 - (t - shakenAt) / 4) : 0.01 * Math.sin(t * 0.8);
      crownGroup.rotation.z = sway;
      blossomGroup.rotation.z = sway;
    },
  };
}
