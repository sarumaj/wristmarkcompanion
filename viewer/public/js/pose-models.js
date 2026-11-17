// Models that respond to how the watch is held (js/seen.js): an aircraft's attitude
// indicator, a marble maze, a penguin keeping its balance. The camera stands in for
// the world: its image's down for gravity, or its line of sight for a maze looked into.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { label } from "./label.js";
import { asSeen, imageDown, intoPicture } from "./seen.js";

const DEG = 180 / Math.PI;

// The ball of an attitude indicator: sky above, ground below, a white horizon, and
// pitch lines every 10 degrees, as vertex colors on a sphere.
function attitudeBall(radius) {
  const geometry = new THREE.SphereGeometry(radius, 64, 48);
  const position = geometry.attributes.position;
  const colors = [];
  const sky = new THREE.Color(0x2f7fd8);
  const ground = new THREE.Color(0x8a5a2b);
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < position.count; i++) {
    const elevation = Math.asin(Math.max(-1, Math.min(1, position.getY(i) / radius))) * DEG;
    const lon = Math.atan2(position.getX(i), position.getZ(i)) * DEG;
    // The ladder only on the side facing the pilot (+z), not all around.
    const ladder = Math.abs(lon) < 25 && Math.abs(elevation) > 5 && Math.abs(elevation % 10) < 0.8;
    const color = Math.abs(elevation) < 1.2 || ladder ? white : elevation > 0 ? sky : ground;
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
}

// An attitude indicator, the aircraft's artificial horizon, standing on the watch and
// facing the camera: its ball stays level with the camera's image, so turning the
// wrist banks it and tilting the watch pitches it. A label reads bank and pitch.
export function attitude(size) {
  const radius = size * 0.34;
  const ball = attitudeBall(radius);
  const center = size * 0.36;
  ball.position.y = center;
  const metal = new THREE.MeshStandardMaterial({ color: 0x6a707b, metalness: 0.15, roughness: 0.45 });
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.04, radius * 0.1, 16, 64), metal);
  bezel.rotation.x = Math.PI / 2;
  bezel.position.y = center;
  // A low case: the ball sits in it up to its middle, as in the instrument's bezel.
  const caseBody = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.12, radius * 1.2, center, 48), metal);
  caseBody.position.y = center / 2 - radius * 0.02;
  // The bank scale's ticks on the bezel, every 10 degrees up to 30, then 60 and 90.
  const orange = new THREE.MeshStandardMaterial({ color: 0xff9f1c, emissive: 0x803c00, roughness: 0.4 });
  const ticks = new THREE.Group();
  for (const degrees of [-90, -60, -30, -20, -10, 0, 10, 20, 30, 60, 90]) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(size * 0.012, size * 0.015, size * (degrees % 30 ? 0.035 : 0.06)), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    const angle = degrees / DEG;
    // On the face toward the camera (+y here), around the top (-z, the watch's 12 o'clock).
    tick.position.set(Math.sin(angle) * radius * 1.04, center + radius * 0.12, -Math.cos(angle) * radius * 1.04);
    tick.rotation.y = -angle;
    ticks.add(tick);
  }
  // The little airplane, fixed in front of the ball: wings and a dot.
  const plane = new THREE.Group();
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.45, size * 0.02, size * 0.025), orange);
    wing.position.x = side * radius * 0.35;
    plane.add(wing);
  }
  plane.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.025, 12, 8), orange));
  plane.position.y = center + radius * 1.02;
  const text = label(size * 1.1);
  text.sprite.position.set(0, center + radius * 1.4, -radius * 1.6);
  const { root, group } = standing(caseBody, ball, bezel, ticks, plane, text.sprite);

  // Level with the image: the ball's up along the image's up and its ladder toward the
  // camera, seen in the model's frame. The bank is how far that up has turned about the
  // face's normal; the pitch, how far it leans out of the face.
  const up = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  let shownAt = -Infinity;
  ball.onBeforeRender = (renderer, scene, viewer) => {
    imageDown(group, viewer, up).negate();
    asSeen(group, viewer, 0, 0, 1, toward);
    toward.addScaledVector(up, -toward.dot(up)).normalize();
    side.crossVectors(up, toward);
    ball.quaternion.setFromRotationMatrix(basis.makeBasis(side, up, toward));
    const now = performance.now();
    if (now - shownAt < 200) return;
    shownAt = now;
    // In the face's plane (x, z), the watch's top is -z; up there is wings level.
    // Turning the watch clockwise banks right: the image's up turns to the watch's left.
    const bank = Math.round(Math.atan2(-up.x, -up.z) * DEG);
    const pitch = Math.round(Math.asin(Math.max(-1, Math.min(1, up.y))) * DEG);
    text.update([
      `Bank ${Math.abs(bank)}°${bank > 0 ? " right" : bank < 0 ? " left" : ""}`,
      `Pitch ${Math.abs(pitch)}° ${pitch > 0 ? "up" : pitch < 0 ? "down" : ""}`.trim(),
    ]);
  };
  return { object: root, animate: () => {} };
}

// A round labyrinth on the watch: three walls, each with a gap, and the goal in the
// middle. Tilt the watch away from the camera on one side and the ball rolls that way,
// as if looking down into it. In the goal it says how long it took, and starts again.
export function maze(size) {
  const plateRadius = size * 0.55;
  const ballRadius = size * 0.04;
  const floor = size * 0.03;
  const wood = new THREE.MeshStandardMaterial({ color: 0xc89a63, roughness: 0.8 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.7 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(plateRadius, plateRadius, floor, 64), wood);
  plate.position.y = floor / 2;
  // The walls: radius, and the gap's center angle; the outer rim has none. Each gap is
  // three and a half balls wide, whatever the wall's radius.
  const walls = [
    { radius: size * 0.42, gap: Math.PI * 0.5 },
    { radius: size * 0.29, gap: -Math.PI * 0.6 },
    { radius: size * 0.16, gap: Math.PI * 0.9 },
  ].map((wall) => ({ ...wall, width: (ballRadius * 3.5) / wall.radius }));
  const thickness = size * 0.012;
  const height = size * 0.06;
  const pieces = [];
  const ring = (radius, arc, start) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, size * 0.012, 8, 64, arc), wall);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = start;
    mesh.scale.z = height / (size * 0.024);
    mesh.position.y = floor + height / 2;
    return mesh;
  };
  pieces.push(ring(plateRadius - size * 0.012, Math.PI * 2, 0));
  for (const { radius, gap, width } of walls) pieces.push(ring(radius, Math.PI * 2 - width, gap + width / 2));
  const goal = new THREE.Mesh(new THREE.CircleGeometry(size * 0.06, 32), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x8a6a00 }));
  goal.rotation.x = -Math.PI / 2;
  goal.position.y = floor + 0.05;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(ballRadius, 24, 16), new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.9, roughness: 0.15 }));
  const text = label(size * 1.1);
  text.sprite.position.set(0, size * 0.45, -size * 0.75);
  const { root, group } = standing(plate, goal, ...pieces, ball, text.sprite);

  // The ball's place and speed on the plate (x, z), in mm and mm/s.
  const at = new THREE.Vector2();
  const speed = new THREE.Vector2();
  const start = () => {
    at.set(0, -(plateRadius + walls[0].radius) / 2);
    speed.set(0, 0);
  };
  start();
  const gravity = new THREE.Vector3();
  let clock = null;
  let startedAt = 0;
  let solvedAt = null;
  ball.onBeforeRender = (renderer, scene, viewer) => intoPicture(group, viewer, gravity);
  // The ball at `angle` fits through the wall's gap.
  const inGap = (angle, { gap, width, radius }) => Math.abs(Math.atan2(Math.sin(angle - gap), Math.cos(angle - gap))) < width / 2 - ballRadius / radius;
  // The rim (no gap) and the walls.
  const limits = [{ radius: plateRadius - thickness * 2, rim: true }, ...walls];
  // One step of rolling: the tilt's pull in the plate's plane, friction, a top speed,
  // and each wall it would cross outside its gap holding it back on its side.
  const pull = size * 6;
  const step = (dt) => {
    speed.x += gravity.x * pull * dt;
    speed.y += gravity.z * pull * dt;
    speed.multiplyScalar(Math.exp(-dt * 1.2));
    if (speed.length() > size * 4) speed.setLength(size * 4);
    const before = at.length();
    at.addScaledVector(speed, dt);
    const angle = Math.atan2(at.y, at.x);
    for (const wall of limits) {
      const outside = !wall.rim && before > wall.radius;
      const after = at.length();
      const touching = outside ? after - ballRadius < wall.radius + thickness : after + ballRadius > wall.radius - thickness;
      if (!touching || (!wall.rim && inGap(angle, wall))) continue;
      const normal = at.clone().normalize();
      at.copy(normal).multiplyScalar(outside ? wall.radius + thickness + ballRadius : wall.radius - thickness - ballRadius);
      // The speed into the wall turns back, a little of it.
      const into = speed.dot(normal);
      if (outside ? into < 0 : into > 0) speed.addScaledVector(normal, -1.3 * into);
    }
  };
  return {
    object: root,
    touch: () => {
      start();
      startedAt = clock ?? 0;
      solvedAt = null;
      return "Ball back";
    },
    animate: (t) => {
      const dt = clock === null ? 0 : Math.min(0.05, Math.max(0, t - clock));
      clock = t;
      if (solvedAt !== null) {
        if (t - solvedAt > 3) {
          start();
          startedAt = t;
          solvedAt = null;
        }
      } else {
        // Small steps, so that a fast ball doesn't pass through a wall.
        const steps = Math.ceil(dt / 0.005);
        for (let i = 0; i < steps; i++) step(dt / steps);
        if (at.length() < size * 0.05) solvedAt = t;
      }
      // Rolling, not sliding: turned about the axis across its way.
      if (speed.lengthSq() > 0) ball.rotateOnWorldAxis(new THREE.Vector3(speed.y, 0, -speed.x).normalize(), (speed.length() * dt) / ballRadius);
      ball.position.set(at.x, floor + ballRadius, at.y);
      goal.material.emissiveIntensity = solvedAt === null ? 0.6 : 1 + Math.sin(t * 20);
      text.update(solvedAt === null ? ["Tilt the watch", "to roll the ball in"] : [`In the middle!`, `${(solvedAt - startedAt).toFixed(1)} s`]);
    },
  };
}

// A penguin on the watch: it shifts from foot to foot, blinks, flaps now and then, and
// keeps upright in the image as the wrist turns, leaning a little late, as if caught
// off balance. A tap makes it hop.
export function penguin(size) {
  const s = size / 20;
  const black = new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8c1a, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(6 * s, 32, 24), black);
  body.scale.set(1, 1.35, 0.95);
  body.position.y = 8 * s;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(5.2 * s, 32, 24), white);
  belly.scale.set(0.85, 1.2, 0.7);
  belly.position.set(0, 7.5 * s, 1.9 * s);
  // The head turns as one: the face, the beak and the eyes on it.
  const head = new THREE.Group();
  head.position.y = 16 * s;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(4 * s, 32, 24), black);
  const face = new THREE.Mesh(new THREE.SphereGeometry(3.1 * s, 24, 16), white);
  face.scale.set(1, 0.85, 0.6);
  face.position.set(0, -0.4 * s, 2 * s);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 2.4 * s, 12), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.7 * s, 4.4 * s);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.55 * s, 12, 8), black);
    eye.position.set(side * 1.3 * s, 0.6 * s, 3.4 * s);
    return eye;
  });
  head.add(skull, face, beak, ...eyes);
  const flippers = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 5.6 * s, 11 * s, 0);
    const flipper = new THREE.Mesh(new THREE.SphereGeometry(1 * s, 16, 12), black);
    flipper.scale.set(1, 4.5, 2);
    flipper.position.y = -4 * s;
    pivot.add(flipper);
    return { side, pivot };
  });
  const feet = [-1, 1].map((side) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1.4 * s, 16, 8), orange);
    foot.scale.set(1, 0.35, 1.8);
    foot.position.set(side * 2.2 * s, 0.5 * s, 2 * s);
    return foot;
  });
  // It leans about its feet: everything above them.
  const upper = new THREE.Group();
  upper.add(body, belly, head, ...flippers.map(({ pivot }) => pivot));
  const balance = new THREE.Group();
  balance.add(upper, ...feet);
  const ice = new THREE.Mesh(new THREE.CylinderGeometry(9 * s, 10 * s, 1 * s, 7), new THREE.MeshStandardMaterial({ color: 0xdff3ff, roughness: 0.2, metalness: 0.05 }));
  ice.position.y = 0.5 * s;
  balance.position.y = 1 * s;
  const { root, group } = standing(ice, balance);

  // Upright in the image: the tilt (about the watch's x and z) that brings its up
  // against the image's down, followed with a lag and some wobble, and limited.
  const down = new THREE.Vector3();
  let target = { x: 0, z: 0 };
  ice.onBeforeRender = (renderer, scene, viewer) => {
    imageDown(group, viewer, down);
    const limit = 0.6;
    target = { x: Math.max(-limit, Math.min(limit, -down.z * 0.8)), z: Math.max(-limit, Math.min(limit, down.x * 0.8)) };
  };
  const lean = { x: 0, z: 0, vx: 0, vz: 0 };
  let clock = null;
  let hopAt = -Infinity;
  return {
    object: root,
    touch: () => {
      hopAt = clock ?? 0;
      return "Hop";
    },
    animate: (t) => {
      const dt = clock === null ? 0 : Math.min(0.05, Math.max(0, t - clock));
      clock = t;
      // A spring toward the upright lean, a little underdamped: it sways back.
      for (const axis of ["x", "z"]) {
        const velocity = `v${axis}`;
        lean[velocity] += ((target[axis] - lean[axis]) * 40 - lean[velocity] * 5) * dt;
        lean[axis] += lean[velocity] * dt;
      }
      balance.rotation.x = lean.x;
      balance.rotation.z = lean.z;
      // Foot to foot, and a hop after a tap.
      const waddle = Math.sin(t * 3);
      upper.rotation.z = waddle * 0.08;
      feet[0].position.y = (0.5 + Math.max(0, waddle) * 0.6) * s;
      feet[1].position.y = (0.5 + Math.max(0, -waddle) * 0.6) * s;
      const hop = t - hopAt;
      balance.position.y = (1 + (hop < 0.6 ? Math.sin((hop / 0.6) * Math.PI) * 6 : 0)) * s;
      // Flapping: now and then, and while hopping.
      const flapping = hop < 0.6 || t % 7 < 0.8;
      for (const { side, pivot } of flippers) pivot.rotation.z = side * (flapping ? 0.3 + 0.5 * Math.abs(Math.sin(t * 14)) : 0.15);
      // A blink every four seconds.
      const blink = t % 4 < 0.12 ? 0.15 : 1;
      for (const eye of eyes) eye.scale.y = blink;
      head.rotation.y = Math.sin(t * 0.7) * 0.4;
    },
  };
}
