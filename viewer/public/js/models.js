// The models, generated in code: no asset files, nothing to license beyond this
// project's own (and Natural Earth's public-domain land, js/land.js). Each one stands
// on the marker: in its anchor's frame x and y lie on the marker's face and z points
// out of it, in millimeters, and `size` is the marker's side. A model is
// {object, animate(seconds)}. `options.now` gives the date the moon, the globe and
// the orrery show (default: the clock).
import * as THREE from "../vendor/three/three.module.js";
import { standing } from "./standing.js";
import { earth, moon, orrery, satellite, worldClock } from "./sky-models.js";
import { hourglass, movement, sundial } from "./clock-models.js";
import { dice, fireworks, robot, snowglobe } from "./fun-models.js";
import { aquarium, campfire, lighthouse } from "./nature-models.js";
import { balloon, helicopter, landing, rocket } from "./aviation-models.js";
import { attitude, maze, penguin } from "./pose-models.js";
import { bonsai, ferrisWheel, sailboat, windmill } from "./scene-models.js";
import { atom, dna, metronome, newtonsCradle } from "./science-models.js";
import { cake, train, ufo, volcano } from "./play-models.js";
import { butterflies, jellyfish } from "./life-models.js";
import { carousel, lavaLamp, raceTrack } from "./fair-models.js";

const MODELS = {
  moon,
  earth,
  robot,
  snowglobe,
  orrery,
  landing,
  fireworks,
  worldClock,
  movement,
  hourglass,
  helicopter,
  dice,
  campfire,
  aquarium,
  lighthouse,
  balloon,
  rocket,
  attitude,
  maze,
  penguin,
  windmill,
  sailboat,
  ferrisWheel,
  bonsai,
  atom,
  dna,
  newtonsCradle,
  metronome,
  volcano,
  ufo,
  train,
  cake,
  jellyfish,
  butterflies,
  carousel,
  raceTrack,
  satellite,
  sundial,
  lavaLamp,

  // A cube with a color per face, on the marker, turning slowly.
  cube(size) {
    const colors = [0xe4572e, 0x29335c, 0xf3a712, 0x669bbc, 0xa8c686, 0xdb2b39].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    const side = size * 0.8;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(side, side, side), colors);
    cube.position.y = side / 2;
    const { root } = standing(cube);
    return { object: root, animate: (t) => (cube.rotation.y = t * 0.6) };
  },

  // A torus knot above the marker, turning.
  knot(size) {
    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(size * 0.35, size * 0.11, 128, 16),
      new THREE.MeshStandardMaterial({ color: 0x8e44ad, metalness: 0.3, roughness: 0.35 }),
    );
    knot.position.y = size * 0.9;
    const { root } = standing(knot);
    return {
      object: root,
      animate: (t) => {
        knot.rotation.y = t * 0.8;
        knot.rotation.x = Math.sin(t * 0.5) * 0.4;
      },
    };
  },

  // A planet with a ring and a moon around it.
  planet(size) {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.4, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a86ff, roughness: 0.8 }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.55, size * 0.75, 64),
      new THREE.MeshStandardMaterial({ color: 0xffbe0b, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2 - 0.4;
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.08, 16, 8),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    );
    const orbit = new THREE.Group();
    orbit.add(moon);
    moon.position.x = size * 1.0;
    const planet = new THREE.Group();
    planet.add(body, ring, orbit);
    planet.position.y = size * 0.9;
    const { root } = standing(planet);
    return {
      object: root,
      animate: (t) => {
        body.rotation.y = t * 0.3;
        orbit.rotation.y = t * 1.2;
      },
    };
  },

  // A flat-shaded crystal, floating up and down.
  crystal(size) {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(size * 0.45),
      new THREE.MeshStandardMaterial({ color: 0x2ec4b6, flatShading: true, metalness: 0.1, roughness: 0.2 }),
    );
    crystal.scale.y = 1.6;
    const { root } = standing(crystal);
    return {
      object: root,
      animate: (t) => {
        crystal.position.y = size * (1.0 + 0.15 * Math.sin(t * 1.5));
        crystal.rotation.y = t * 0.7;
      },
    };
  },
};

export const MODEL_NAMES = Object.keys(MODELS);

// What the viewer tells about a model while it shows: a hint for its gestures and
// taps, and buttons that do the same (for whoever can't or won't move the wrist or
// tap; the keyboard reaches them too). Each action is the gesture the model would
// get, or its tap (`touch`). A tap on a model with one gesture action does that.
export const MODEL_GUIDES = {
  dice: { hint: "Tap it, flick or shake your wrist to roll", actions: [{ label: "Roll", gesture: "flick" }] },
  snowglobe: { hint: "Tap it or shake your wrist to stir the snow", actions: [{ label: "Shake", gesture: "shake" }] },
  robot: { hint: "Tap it or flick your wrist and it waves", actions: [{ label: "Wave", gesture: "flick" }] },
  fireworks: { hint: "Tap it or flick your wrist to launch a rocket", actions: [{ label: "Launch", gesture: "flick" }] },
  campfire: { hint: "Tap it or shake your wrist to stir the fire", actions: [{ label: "Stir", gesture: "shake" }] },
  aquarium: { hint: "Tap the glass to startle the fish", actions: [{ label: "Startle", touch: true }] },
  balloon: { hint: "Tap it to fire the burner", actions: [{ label: "Burner", touch: true }] },
  rocket: { hint: "Tap it to count down the next launch", actions: [{ label: "Count down", touch: true }] },
  attitude: { hint: "Turn your wrist to bank, tilt the watch to pitch" },
  maze: { hint: "Tilt the watch to roll the ball to the middle", actions: [{ label: "Ball back", touch: true }] },
  penguin: { hint: "Turn your wrist and it keeps its balance; tap it to hop", actions: [{ label: "Hop", touch: true }] },
  windmill: { hint: "Tap it for a gust of wind", actions: [{ label: "Gust", touch: true }] },
  sailboat: { hint: "Tap it to come about", actions: [{ label: "Come about", touch: true }] },
  ferrisWheel: { hint: "Lit after dark; tap it for the lights", actions: [{ label: "Lights", touch: true }] },
  bonsai: { hint: "The season of today; tap it to shake it", actions: [{ label: "Shake", touch: true }] },
  atom: { hint: "Tap it to excite the electrons", actions: [{ label: "Excite", touch: true }] },
  dna: { hint: "Tap it to unzip the strands", actions: [{ label: "Unzip", touch: true }] },
  newtonsCradle: { hint: "Tap it to lift another ball", actions: [{ label: "Another ball", touch: true }] },
  metronome: { hint: "Tap it for the next tempo", actions: [{ label: "Tempo", touch: true }] },
  volcano: { hint: "Tap it and it erupts", actions: [{ label: "Erupt", touch: true }] },
  ufo: { hint: "Tap it to beam the cow up", actions: [{ label: "Beam", touch: true }] },
  train: { hint: "Tap it to blow the whistle", actions: [{ label: "Whistle", touch: true }] },
  cake: { hint: "Tap it to blow out the candles", actions: [{ label: "Blow out", touch: true }] },
  jellyfish: { hint: "Tap it and it swims up", actions: [{ label: "Swim", touch: true }] },
  butterflies: { hint: "Tap them and they scatter", actions: [{ label: "Scatter", touch: true }] },
  carousel: { hint: "Tap it to go faster", actions: [{ label: "Faster", touch: true }] },
  raceTrack: { hint: "Tap it to boost the red car", actions: [{ label: "Boost red", touch: true }] },
  satellite: { hint: "Tap it to ping the satellite", actions: [{ label: "Ping", touch: true }] },
  sundial: { hint: "The shadow of your clock's time; tap it to read it", actions: [{ label: "Read", touch: true }] },
  lavaLamp: { hint: "Tap it for other colors", actions: [{ label: "Colors", touch: true }] },
  orrery: {
    hint: "Tap a planet for its name; twist your wrist to move a month",
    actions: [
      { label: "Month earlier", gesture: "twist", direction: -1 },
      { label: "Month later", gesture: "twist", direction: 1 },
    ],
  },
};

// A new instance of the model `name`, for a marker `size` millimeters wide.
export function createModel(name, size, options = {}) {
  const make = MODELS[name];
  if (!make) {
    throw new Error(`no model "${name}"`);
  }
  return make(size, { now: () => new Date(), ...options });
}

// The light the models are shown in: from above the camera, and all around.
export function lights() {
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(0.3, 1, 1);
  return [new THREE.HemisphereLight(0xffffff, 0x444444, 1.2), sun];
}
