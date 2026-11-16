// The moon as it is tonight, the Earth with day and night and the planets around
// the sun, all from the time
// alone (js/sky.js): no location, no permission, no network.
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { moonPhase, nextElongation, PLANET_NAMES, planetPosition, subsolarPoint } from "./sky.js";
import { LAND } from "./land.js";

const RAD = Math.PI / 180;
const DAY_MS = 86400000;

// A text label floating over a model, drawn on a canvas; `update(lines)` redraws it.
function label(width) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(width, width / 4, 1);
  let shown = "";
  return {
    sprite,
    update(lines) {
      if (lines.join("\n") === shown) return;
      shown = lines.join("\n");
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(0, 0, 0, 0.55)";
      context.beginPath();
      context.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 24);
      context.fill();
      context.fillStyle = "#fff";
      context.font = "600 40px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      lines.forEach((line, i) => context.fillText(line, canvas.width / 2, 64 + (i - (lines.length - 1) / 2) * 46));
      texture.needsUpdate = true;
    },
  };
}

function inDays(from, to) {
  const days = Math.round((to - from) / DAY_MS);
  if (days <= 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

// The moon, lit as it is now: the sun's direction is set in the camera's frame each
// frame, from the moon's elongation, so the phase looks right from wherever the
// watch is seen. Waxing is lit on the right, as seen from the northern hemisphere.
// The seas (maria) are a few dark patches, roughly where the near side has them.
export function moon(size, { now }) {
  const material = new THREE.ShaderMaterial({
    uniforms: { sun: { value: new THREE.Vector3(0, 0, 1) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vSurface;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vSurface = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 sun;
      varying vec3 vNormal;
      varying vec3 vSurface;
      float sea(vec3 center, float radius) {
        return 1.0 - smoothstep(radius * 0.7, radius, acos(clamp(dot(vSurface, normalize(center)), -1.0, 1.0)));
      }
      void main() {
        // Irregular seas from overlapping patches, lighter at their edges.
        float seas = 0.0;
        seas += 0.7 * sea(vec3(0.35, 0.55, 0.75), 0.32) + 0.6 * sea(vec3(0.15, 0.35, 0.9), 0.22);
        seas += 0.7 * sea(vec3(-0.45, 0.35, 0.8), 0.26) + 0.5 * sea(vec3(-0.25, 0.6, 0.75), 0.18);
        seas += 0.6 * sea(vec3(0.05, -0.15, 1.0), 0.2) + 0.5 * sea(vec3(-0.7, -0.05, 0.7), 0.17);
        seas += 0.5 * sea(vec3(0.6, -0.4, 0.65), 0.14) + 0.4 * sea(vec3(-0.2, -0.45, 0.85), 0.12);
        seas = min(seas, 1.0);
        // A pale crater with rays in the south.
        seas -= 0.5 * sea(vec3(-0.15, -0.8, 0.55), 0.06);
        float albedo = mix(0.8, 0.55, seas);
        // The moon's regolith looks evenly bright up to the terminator, not like a
        // shaded ball: a steep ramp, and a trace of earthshine on the dark side.
        float lit = smoothstep(-0.04, 0.2, dot(normalize(vNormal), sun));
        gl_FragColor = vec4(vec3(albedo) * (0.035 + 0.965 * lit), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(size * 0.4, 48, 24), material);
  const center = new THREE.Vector3();
  const right = new THREE.Vector3();
  let phase = moonPhase(now());
  ball.onBeforeRender = (renderer, scene, camera) => {
    // From the moon toward the camera, and the camera's right across that line.
    center.setFromMatrixPosition(ball.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    const toCamera = center.negate().normalize();
    right.set(1, 0, 0).addScaledVector(toCamera, -toCamera.x).normalize();
    // The angle sun-moon-viewer: 0 at full moon, 180 at new moon.
    const angle = Math.abs(180 - phase.elongation) * RAD;
    material.uniforms.sun.value
      .copy(toCamera)
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(right, (phase.waxing ? 1 : -1) * Math.sin(angle));
  };
  ball.position.y = size * 0.75;
  const text = label(size * 1.4);
  text.sprite.position.y = size * 1.45;
  const { root } = standing(ball, text.sprite);
  let updated = -Infinity;
  return {
    object: root,
    animate: (t) => {
      ball.position.y = size * (0.75 + 0.05 * Math.sin(t * 1.2));
      ball.rotation.y = 0.15 * Math.sin(t * 0.4);
      // The phase and its label once a minute: they change slowly.
      if (t - updated < 60 && updated <= t) return;
      updated = t;
      const date = now();
      phase = moonPhase(date);
      const full = nextElongation(date, 180);
      const next = phase.waxing ? `Full moon ${inDays(date, full)}` : `New moon ${inDays(date, nextElongation(date, 0))}`;
      text.update([`${phase.waxing ? "Waxing" : "Waning"}, ${Math.round(phase.illumination * 100)}% lit`, next]);
    },
  };
}

// The land mask (js/land.js) as a texture: white land, black sea.
function landTexture() {
  const bits = Uint8Array.from(atob(LAND.bits), (c) => c.charCodeAt(0));
  const pixels = new Uint8Array(LAND.width * LAND.height * 4);
  for (let cell = 0; cell < LAND.width * LAND.height; cell++) {
    const value = bits[cell >> 3] & (0x80 >> (cell & 7)) ? 255 : 0;
    pixels.set([value, value, value, 255], cell * 4);
  }
  const texture = new THREE.DataTexture(pixels, LAND.width, LAND.height);
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// The Earth with the sun's light as it falls now: the day side around the point
// where the sun is overhead, the terminator, the night side dark. A yellow meridian
// marks the viewer's time zone (its offset, 15 degrees an hour: the browser knows no
// more without asking for the location). North points to the watch's top, tilted
// toward the camera, and the globe turns slowly so that it reads as a ball.
export function earth(size, { now }) {
  const sunPoint = () => {
    const { latitude, longitude } = subsolarPoint(now());
    const phi = latitude * RAD;
    const lambda = longitude * RAD;
    return new THREE.Vector3(Math.cos(phi) * Math.cos(lambda), Math.sin(phi), -Math.cos(phi) * Math.sin(lambda));
  };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      land: { value: landTexture() },
      sun: { value: sunPoint() },
      here: { value: -new Date().getTimezoneOffset() / 4 },
    },
    vertexShader: `
      varying vec3 vSurface;
      varying vec3 vNormal;
      void main() {
        vSurface = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D land;
      uniform vec3 sun;
      uniform float here;
      varying vec3 vSurface;
      varying vec3 vNormal;
      const float PI = 3.14159265;
      void main() {
        // Latitude and longitude, in the model's frame: y north, x at longitude 0,
        // east toward -z.
        float lat = asin(clamp(vSurface.y, -1.0, 1.0));
        float lon = atan(-vSurface.z, vSurface.x);
        float isLand = texture2D(land, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI)).r;
        vec3 color = mix(vec3(0.05, 0.25, 0.6), vec3(0.3, 0.55, 0.25), isLand);
        color = mix(color, vec3(0.92), smoothstep(1.2, 1.3, abs(lat)));
        float sunHeight = dot(vSurface, sun);
        float day = smoothstep(-0.06, 0.06, sunHeight);
        vec3 lit = color * (0.6 + 0.4 * max(sunHeight, 0.0));
        vec3 night = color * 0.1 + vec3(0.0, 0.01, 0.04);
        color = mix(night, lit, day);
        float offset = abs(mod(degrees(lon) - here + 540.0, 360.0) - 180.0);
        float meridian = (1.0 - smoothstep(0.8, 1.6, offset)) * (1.0 - smoothstep(1.1, 1.25, abs(lat)));
        color = mix(color, vec3(1.0, 0.82, 0.0), meridian);
        // A thin rim of atmosphere toward the edge.
        color += vec3(0.1, 0.2, 0.4) * pow(1.0 - abs(normalize(vNormal).z), 3.0) * (0.3 + 0.7 * day);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(size * 0.45, 64, 32), material);
  const axis = new THREE.Group();
  // y (north) to the watch's top, leaning 23.4 degrees toward the camera.
  axis.rotation.x = -Math.PI / 2 + 23.4 * RAD;
  axis.add(globe);
  axis.position.y = size * 0.75;
  const { root } = standing(axis);
  return {
    object: root,
    animate: (t) => {
      globe.rotation.y = t * 0.2;
      material.uniforms.sun.value.copy(sunPoint());
    },
  };
}

// Each planet's color and size (in marker sizes); Saturn also gets its ring.
const PLANET_LOOKS = {
  mercury: [0xa8a29a, 0.025],
  venus: [0xe8cf8f, 0.035],
  earth: [0x3a7bd5, 0.037],
  mars: [0xc1502e, 0.03],
  jupiter: [0xd8a66b, 0.07],
  saturn: [0xe3c98d, 0.06],
  uranus: [0x9fd8e0, 0.045],
  neptune: [0x4d6fdc, 0.045],
};

// The planets around the sun as they stand today, seen from the ecliptic's north,
// moving counterclockwise. Their directions from the sun are true (js/sky.js, JPL's
// elements); their distances are not to scale (Neptune is 78 times as far out as
// Mercury), one orbit after the other, and the planets are much enlarged. The
// vernal equinox points to the watch's top. A label gives the date.
export function orrery(size, { now }) {
  const system = new THREE.Group();
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.1, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb000, emissiveIntensity: 1.2 }),
  );
  system.add(sun);
  const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.5 });
  const planets = PLANET_NAMES.map((name, i) => {
    const radius = size * (0.2 + 0.1 * i);
    const points = Array.from({ length: 97 }, (_, k) => {
      const angle = (k / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    });
    system.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), orbitMaterial));
    const [color, scale] = PLANET_LOOKS[name];
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(size * scale, 20, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    if (name === "saturn") {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size * scale * 1.4, size * scale * 2.1, 32),
        new THREE.MeshStandardMaterial({ color: 0xcdb58a, side: THREE.DoubleSide }),
      );
      ring.rotation.x = Math.PI / 2 - 0.47;
      body.add(ring);
    }
    system.add(body);
    return { name, radius, body };
  });
  system.position.y = size * 0.35;
  const text = label(size * 1.2);
  // Beyond Neptune's orbit at the watch's top, clear of the planets seen face on.
  text.sprite.position.set(0, size * 0.45, -size * 1.1);
  const { root } = standing(system, text.sprite);
  const place = () => {
    const date = now();
    for (const { name, radius, body } of planets) {
      const { x, y } = planetPosition(name, date);
      // Ecliptic x to the watch's top (-z here), y to its left (-x), north up (y).
      const angle = Math.atan2(y, x);
      body.position.set(-Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
    }
    text.update(["The planets today", date.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })]);
  };
  place();
  let placed = 0;
  return {
    object: root,
    animate: (t) => {
      sun.material.emissiveIntensity = 1.1 + 0.2 * Math.sin(t * 2);
      for (const { body } of planets) body.rotation.y = t;
      system.position.y = size * (0.35 + 0.03 * Math.sin(t * 0.8));
      if (Math.abs(t - placed) > 60) {
        placed = t;
        place();
      }
    },
  };
}
