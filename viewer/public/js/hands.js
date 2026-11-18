// The other hand in front of the camera (switched on with the hand button or H): MediaPipe's
// hand landmarker finds the hands' 21 points in the camera's image, in the browser; the
// hand that isn't wearing the watch can then touch the model. Its library (1.2 MB of
// JavaScript, 14 MB of WebAssembly) and its model (7.8 MB) come from the viewer's own
// origin, and only when it is switched on (docs/dev/interaction.md).
//
// Seen from one camera, how far away a finger is can only be guessed; so the touch is
// on the image, where the finger covers the model:
// - pointing (the index finger out, the others curled) onto the model is a tap;
// - a pinch (thumb and index together) on the model grabs it, and moving it turns the
//   model as a drag does (js/touch.js); opening the fingers lets go;
// - an open hand waved, its palm back and forth, is a wave (the models' shake);
// - an open hand swept across the picture is a swipe, left or right.
// The pointer is smoothed (a One Euro filter, as the watch's pose in js/smoothing.js):
// the landmarks shake by a few pixels from frame to frame.

// The landmarks: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_BASE = 5;
const INDEX_MIDDLE = 6;
const INDEX_TIP = 8;
const MIDDLE_BASE = 9;
const MIDDLE_MIDDLE = 10;
const MIDDLE_TIP = 12;
const RING_MIDDLE = 14;
const RING_TIP = 16;
const PINKY_BASE = 17;
const PINKY_MIDDLE = 18;
const PINKY_TIP = 20;
// The hand's bones, for drawing it (the debug view).
export const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

// A pinch closes below this share of the palm's length (wrist to the index's base),
// and opens above the second: apart, so that it doesn't flicker at the edge.
const PINCH_CLOSE = 0.3;
const PINCH_OPEN = 0.45;
// A hand whose wrist is this many watch radii from the watch's center wears it.
const WEARING = 2.5;
// After a tap, the next one waits this long, and for the finger to leave the model.
const TAP_REFRACTORY_MS = 700;
// A swipe: the open hand's palm across at least SWIPE_PALMS palm lengths (and
// SWIPE_SHARE of the picture's width) within SWIPE_MS, mostly sideways.
export const SWIPE_PALMS = 1.6;
export const SWIPE_SHARE = 0.15;
export const SWIPE_MS = 400;
// A wave: the open palm's sideways movement turning WAVE_TURNS times within WAVE_MS,
// each swing at least WAVE_PALMS palm lengths.
export const WAVE_TURNS = 3;
export const WAVE_MS = 1300;
export const WAVE_PALMS = 0.35;
// After a swipe or a wave, neither comes again for this long.
export const SWEEP_REFRACTORY_MS = 900;
// The pointer's One Euro filter: Hz while still, and more per image width a second.
const POINTER_CUTOFF = 2;
const POINTER_BETA = 12;

// A One Euro filter of a point (x, y) in the image (0 to 1), t in ms.
class PointFilter {
  #point = null;
  #speed = 0;
  #t = 0;

  reset() {
    this.#point = null;
  }

  update(point, t) {
    if (!this.#point) {
      this.#point = { ...point };
      this.#speed = 0;
      this.#t = t;
      return { ...point };
    }
    const dt = Math.max(1, t - this.#t) / 1000;
    this.#t = t;
    const factor = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const moved = Math.hypot(point.x - this.#point.x, point.y - this.#point.y) / dt;
    this.#speed += factor(1) * (moved - this.#speed);
    const a = factor(POINTER_CUTOFF + POINTER_BETA * this.#speed);
    this.#point.x += a * (point.x - this.#point.x);
    this.#point.y += a * (point.y - this.#point.y);
    return { ...this.#point };
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// What one hand does: its pointer (the index's tip, or between the pinching fingers),
// whether it pinches (with the hysteresis of `wasPinching`), and whether it points.
export function handPose(landmarks, wasPinching = false) {
  const palm = distance(landmarks[WRIST], landmarks[INDEX_BASE]) || 1e-6;
  const gap = distance(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / palm;
  const pinching = gap < (wasPinching ? PINCH_OPEN : PINCH_CLOSE);
  const wrist = landmarks[WRIST];
  const pointing =
    !pinching &&
    distance(wrist, landmarks[INDEX_TIP]) > 1.1 * distance(wrist, landmarks[INDEX_MIDDLE]) &&
    distance(wrist, landmarks[MIDDLE_TIP]) < 1.05 * distance(wrist, landmarks[MIDDLE_MIDDLE]);
  const tip = landmarks[INDEX_TIP];
  const thumb = landmarks[THUMB_TIP];
  const pointer = pinching ? { x: (tip.x + thumb.x) / 2, y: (tip.y + thumb.y) / 2 } : { x: tip.x, y: tip.y };
  // Open: the four fingers out (each tip farther from the wrist than its middle joint).
  const out = (middle, tipIndex) => distance(wrist, landmarks[tipIndex]) > 1.1 * distance(wrist, landmarks[middle]);
  const open = !pinching && out(INDEX_MIDDLE, INDEX_TIP) && out(MIDDLE_MIDDLE, MIDDLE_TIP) && out(RING_MIDDLE, RING_TIP) && out(PINKY_MIDDLE, PINKY_TIP);
  // The palm's center: between the wrist and the bases of the index, middle and little fingers.
  const palmPoints = [WRIST, INDEX_BASE, MIDDLE_BASE, PINKY_BASE].map((i) => landmarks[i]);
  const center = { x: palmPoints.reduce((s, p) => s + p.x, 0) / 4, y: palmPoints.reduce((s, p) => s + p.y, 0) / 4 };
  return { pointer, pinching, pointing, open, palm, center };
}

// Swipes and waves of an open hand, from its palm's center over time (t in ms, the
// image's coordinates, 0 to 1); `update` returns the gesture completed, or null.
export class SweepRecognizer {
  #track = [];
  #turns = [];
  #last = -Infinity;
  // The sideways direction the palm last moved in (-1, 1), and where it was then.
  #direction = 0;
  #previous = null;

  reset() {
    this.#track = [];
    this.#turns = [];
    this.#direction = 0;
    this.#previous = null;
  }

  update(t, { open, palm, center }) {
    if (!open) {
      this.reset();
      return null;
    }
    this.#track.push({ t, x: center.x, y: center.y });
    while (this.#track.length && this.#track[0].t < t - WAVE_MS) this.#track.shift();
    if (t - this.#last < SWEEP_REFRACTORY_MS) return null;
    // A swipe: the farthest sideways the palm has come within SWIPE_MS.
    for (const from of this.#track) {
      if (from.t < t - SWIPE_MS) continue;
      const dx = center.x - from.x;
      const dy = center.y - from.y;
      if (Math.abs(dx) > Math.max(SWIPE_PALMS * palm, SWIPE_SHARE) && Math.abs(dx) > 2 * Math.abs(dy)) {
        this.#last = t;
        this.reset();
        return { type: "swipe", direction: Math.sign(dx) };
      }
      break;
    }
    // A wave: where the sideways movement turned, each turn a swing away from the last.
    // A move of less than a twentieth of the palm is no move (the landmarks' jitter).
    const previous = this.#previous;
    this.#previous = { t, x: center.x };
    if (previous && Math.abs(center.x - previous.x) > 0.05 * palm) {
      const direction = Math.sign(center.x - previous.x);
      const lastTurn = this.#turns.at(-1);
      if (this.#direction && direction !== this.#direction && (!lastTurn || Math.abs(previous.x - lastTurn.x) > WAVE_PALMS * palm)) {
        this.#turns.push({ t: previous.t, x: previous.x });
      }
      this.#direction = direction;
    }
    this.#turns = this.#turns.filter((turn) => turn.t >= t - WAVE_MS);
    if (this.#turns.length >= WAVE_TURNS) {
      this.#last = t;
      this.reset();
      return { type: "wave" };
    }
    return null;
  }
}

// From the hands seen in each frame to taps and drags on the model. Coordinates are the
// image's, 0 to 1 (MediaPipe's normalized ones). `update` takes the hands' landmarks,
// the watch as {x, y, radius} (or null), and `over(x, y)`, whether the model is there;
// it returns the events, and `cursor` is what to show of the free hand.
export class HandInteraction {
  cursor = null;
  // For the debug view: the hands seen ({landmarks, free}), and the free hand's state.
  seen = [];
  state = null;
  #filter = new PointFilter();
  #sweeps = new SweepRecognizer();
  #pinching = false;
  #grabbing = false;
  #last = null;
  #tapped = -Infinity;
  #armed = true;

  update(t, hands, watch, over) {
    const events = [];
    const hand = this.#freeHand(hands, watch);
    this.seen = hands.map((landmarks) => ({ landmarks, free: landmarks === hand }));
    if (!hand) {
      if (this.#grabbing) events.push({ type: "release" });
      this.#grabbing = false;
      this.#pinching = false;
      this.#last = null;
      this.cursor = null;
      this.state = null;
      this.#filter.reset();
      this.#sweeps.reset();
      return events;
    }
    const pose = handPose(hand, this.#pinching);
    const { pinching, pointing } = pose;
    // The pointer smoothed; where the fingers meet or part, the filter starts afresh.
    if (pinching !== this.#pinching) this.#filter.reset();
    const pointer = this.#filter.update(pose.pointer, t);
    this.state = pose;
    // Swipes and waves, while the hand isn't holding the model.
    const sweep = this.#grabbing ? null : this.#sweeps.update(t, pose);
    if (sweep) events.push(sweep);
    const onModel = over(pointer.x, pointer.y);
    // A pinch that closes on the model grabs it; it turns while held, wherever it goes,
    // from the next frame on: the pointer jumps when the fingers meet.
    const held = this.#grabbing;
    if (pinching && !this.#pinching && onModel) this.#grabbing = true;
    if (held && this.#grabbing && pinching && this.#last) {
      events.push({ type: "drag", x: pointer.x, y: pointer.y, dx: pointer.x - this.#last.x, dy: pointer.y - this.#last.y });
    }
    if (this.#grabbing && !pinching) {
      this.#grabbing = false;
      events.push({ type: "release" });
    }
    // Pointing onto the model taps it, once, until the finger has left it.
    if (!onModel) this.#armed = true;
    if (pointing && onModel && this.#armed && t - this.#tapped > TAP_REFRACTORY_MS) {
      events.push({ type: "tap", x: pointer.x, y: pointer.y });
      this.#tapped = t;
      this.#armed = false;
    }
    this.#pinching = pinching;
    this.#last = pointer;
    this.cursor = { ...pointer, pinching, pointing, open: pose.open, grabbing: this.#grabbing, over: onModel };
    return events;
  }

  // The hand not wearing the watch: of those whose wrist is away from it, the one whose
  // finger is nearest to it. Without a watch in view, the first hand.
  #freeHand(hands, watch) {
    if (!watch) return hands[0] ?? null;
    const free = hands.filter((hand) => distance(hand[WRIST], watch) > WEARING * watch.radius);
    free.sort((a, b) => distance(a[INDEX_TIP], watch) - distance(b[INDEX_TIP], watch));
    return free[0] ?? null;
  }
}

// MediaPipe's hand landmarker, loaded on first use: on the GPU where the browser lets it,
// on the CPU otherwise. Resolves to {detect(video, t) → {image, world}, close()}: each hand's
// points in the image (0 to 1) and in meters about the hand's center (js/occlusion.js).
export async function loadHandTracker(base = "vendor/mediapipe") {
  const { FilesetResolver, HandLandmarker } = await import(`../${base}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(new URL(`${base}/wasm`, document.baseURI).href);
  const create = (delegate) =>
    HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL(`${base}/hand_landmarker.task`, document.baseURI).href, delegate },
      runningMode: "VIDEO",
      numHands: 2,
    });
  const landmarker = await create("GPU").catch(() => create("CPU"));
  return {
    detect: (video, t) => {
      const result = landmarker.detectForVideo(video, t);
      return { image: result.landmarks ?? [], world: result.worldLandmarks ?? [] };
    },
    close: () => landmarker.close(),
  };
}
