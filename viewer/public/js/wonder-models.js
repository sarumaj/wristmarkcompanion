// Wonders on the watch: a puzzle cube that scrambles and solves itself, and a black hole
// with its glowing disk, its light bent as a real one bends it. A tap hurries the cube and
// feeds the black hole a star.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";

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

// A black hole floating over the watch, drawn as light would show it: each pixel's ray is
// traced back from the camera past the hole, bent by its gravity (a Schwarzschild hole's
// photon orbits, integrated in steps), until it falls in (the black shadow) or crosses the
// thin disk of hot gas round it. The disk's far side so shows above and below the shadow,
// bent over it, with a thin bright ring at the shadow's edge (the light that went round the
// hole once more); the side coming toward the camera is brighter and bluer (Doppler
// beaming), the gas hotter inside and redder out, streaked and turning at Kepler's pace.
// A tap feeds it a star, which spirals in, is stretched into a stream (its light bent as
// well) and flares the disk as it goes.
//
// In the shader the hole's Schwarzschild radius is the unit; the gas orbits from the
// innermost stable orbit (3) out.
const HOLE_VERTEX = `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const HOLE_FRAGMENT = `
  uniform vec3 uCamera;
  uniform mat3 uTilt;
  uniform float uTime;
  uniform float uFlare;
  uniform vec3 uStarHead;
  uniform vec3 uStarTail;
  uniform float uStar;
  varying vec3 vLocal;

  const float INNER = 3.0;
  const float OUTER = 9.5;
  const float BOUND = 11.0;
  const int STEPS = 220;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }

  // Roughly a black body's color at temperature t (1: the disk's hottest, at rest).
  vec3 glow(float t) {
    vec3 red = vec3(0.9, 0.12, 0.01);
    vec3 orange = vec3(1.0, 0.45, 0.08);
    vec3 white = vec3(1.0, 0.86, 0.62);
    vec3 blue = vec3(0.75, 0.85, 1.0);
    vec3 c = mix(red, orange, smoothstep(0.2, 0.55, t));
    c = mix(c, white, smoothstep(0.7, 1.1, t));
    return mix(c, blue, smoothstep(1.25, 1.7, t));
  }

  // The disk where the ray crosses it at q (radius r), the ray going along v (from the
  // camera): color (premultiplied) and opacity.
  vec4 disk(vec3 q, float r, vec3 v) {
    // Streaks that turn with the gas: the pattern's angle goes back by the orbit's.
    float omega = 0.7071 / pow(r, 1.5);
    float a = atan(q.z, q.x) - omega * uTime * 2.2;
    vec3 polar = vec3(cos(a) * 2.2, sin(a) * 2.2, r * 1.6);
    float streaks = 0.55 * noise(polar * vec3(1.0, 1.0, 1.0)) + 0.3 * noise(polar * vec3(2.3, 2.3, 3.1)) + 0.15 * noise(polar * 5.0);
    // A thin disk's temperature, highest a little out from its inner edge.
    float t = pow(r / INNER, -0.75) * pow(max(1.0 - sqrt(INNER / r), 0.0), 0.25) * 1.75;
    // The gas's speed (a fraction of light's) along its orbit, and the shift its light
    // gets toward the camera: Doppler and gravity.
    float beta = sqrt(0.5 / r);
    vec3 along = normalize(vec3(-q.z, 0.0, q.x));
    float toward = dot(along, -normalize(v));
    float g = sqrt(1.0 - beta * beta) / (1.0 - beta * toward) * sqrt(1.0 - 1.0 / r);
    float shown = t * g;
    float lanes = streaks * streaks;
    float bright = pow(shown, 3.0) * (0.15 + 2.4 * lanes) * (1.0 + 2.5 * uFlare) * 1.3;
    float edges = smoothstep(INNER, INNER + 0.4, r) * (1.0 - smoothstep(OUTER - 4.0, OUTER, r));
    float alpha = clamp(bright * 0.8, 0.0, 0.85) * edges;
    return vec4(glow(shown) * bright * edges, alpha);
  }

  float segment(vec3 p, vec3 a, vec3 b) {
    vec3 ab = b - a;
    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    return length(p - a - ab * h);
  }

  void main() {
    // In the disk's frame, tilted in the sphere's.
    vec3 camera = uTilt * uCamera;
    vec3 entry = uTilt * vLocal;
    vec3 v = normalize(entry - camera);
    // From where the ray enters the bounding sphere, or the camera inside it.
    vec3 p = dot(camera, camera) < BOUND * BOUND ? camera : entry;
    // The orbit's angular momentum squared: what bends it, constant along the way.
    vec3 h = cross(p, v);
    float h2 = dot(h, h);
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float r = length(p);
      float dt = clamp(0.06 * r * r, 0.03, 0.5);
      // Shorter steps past the star, or its light comes in bands, a step apart.
      float star = uStar > 0.0 ? segment(p, uStarHead, uStarTail) : 100.0;
      dt = min(dt, max(0.03, 0.5 * star));
      v += -1.5 * h2 * p / pow(r, 5.0) * dt;
      vec3 next = p + v * dt;
      if (p.y * next.y < 0.0) {
        vec3 q = mix(p, next, p.y / (p.y - next.y));
        float rq = length(q.xz);
        if (rq > INNER && rq < OUTER) {
          vec4 d = disk(q, rq, v);
          color += (1.0 - alpha) * d.rgb;
          alpha += (1.0 - alpha) * d.a;
        }
      }
      if (uStar > 0.0) {
        float d = star;
        float lit = exp(-d * d / 0.02) * dt * 4.0 * uStar;
        color += (1.0 - alpha) * vec3(0.7, 0.85, 1.0) * lit;
        alpha += (1.0 - alpha) * min(lit, 1.0);
      }
      p = next;
      // Fallen in: nothing behind it comes through.
      if (dot(p, p) < 1.0) {
        alpha = 1.0;
        break;
      }
      if (alpha > 0.995 || (dot(p, p) > BOUND * BOUND && dot(p, v) > 0.0)) break;
    }
    // A soft tone curve: the disk's hottest parts white, not clipped to flat color.
    color = vec3(1.0) - exp(-color * 1.3);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }`;

export function blackHole(size) {
  // The Schwarzschild radius: the shadow is about 2.6 of them across, the disk 19.
  const rs = size * 0.045;
  const center = size * 0.56;
  const uniforms = {
    uCamera: { value: new THREE.Vector3(0, 0, 30) },
    // Tilted away from the camera of the usual view (from the watch's bottom edge, at an
    // angle), so the disk is seen nearly edge-on and its far side shows bent over the
    // hole. In the shader, not on the mesh: the sphere's box stays above the watch.
    uTilt: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationX(0.38)) },
    uTime: { value: 0 },
    uFlare: { value: 0 },
    uStarHead: { value: new THREE.Vector3() },
    uStarTail: { value: new THREE.Vector3() },
    uStar: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HOLE_VERTEX,
    fragmentShader: HOLE_FRAGMENT,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  // Where the rays are traced: a sphere round the hole, its radius BOUND.
  const space = new THREE.Mesh(new THREE.SphereGeometry(11, 48, 24), material);
  space.scale.setScalar(rs);
  const system = new THREE.Group();
  system.position.y = center;
  system.add(space);
  // The camera in the shader's frame, each frame: the rays start from it.
  const inverse = new THREE.Matrix4();
  const eye = new THREE.Vector3();
  space.onBeforeRender = (renderer, scene, camera) => {
    inverse.copy(space.matrixWorld).invert();
    uniforms.uCamera.value.copy(camera.getWorldPosition(eye)).applyMatrix4(inverse);
  };
  const base = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.04, center - rs * 10, 12), new THREE.MeshStandardMaterial({ color: 0x343a40, metalness: 0.5 }));
  base.position.y = (center - rs * 10) / 2;
  const { root } = standing(base, system);
  let clock = 0;
  let fedAt = -1000;
  return {
    object: root,
    touch: () => {
      if (clock - fedAt < 3.5) return null;
      fedAt = clock;
      return "Fed a star";
    },
    animate: (t) => {
      clock = t;
      uniforms.uTime.value = t;
      // The star: from the disk's edge in a tightening spiral, drawn out into a stream
      // behind it as the tides pull it apart.
      const since = t - fedAt;
      const k = Math.min(1, Math.max(0, since / 3));
      const place = (time, target) => {
        const q = Math.min(1, Math.max(0, time / 3));
        const r = 10 - 8.6 * q * q;
        const angle = time * (1.2 + 3.5 * q);
        return target.set(Math.cos(angle) * r, 0.15 * Math.sin(time * 3), Math.sin(angle) * r);
      };
      uniforms.uStar.value = since >= 0 && since < 3 ? 1 - 0.6 * k : 0;
      place(since, uniforms.uStarHead.value);
      place(Math.max(0, since - 0.15 - 0.9 * k * k), uniforms.uStarTail.value);
      // The flare as it goes in.
      uniforms.uFlare.value = since > 2.6 && since < 4 ? Math.sin(((since - 2.6) / 1.4) * Math.PI) : 0;
    },
  };
}
