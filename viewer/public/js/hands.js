// The other hand in front of the camera (switched on with the hand button or H): MediaPipe's
// hand landmarker finds the hands' 21 points in the camera's image, in the browser; the
// hand that isn't wearing the watch can then touch the model. Its library (1.2 MB of
// JavaScript, 14 MB of WebAssembly) and its model (7.8 MB) come from the viewer's own
// origin, and only when it is switched on (docs/interaction.md).
//
// Seen from one camera, how far away a finger is can only be guessed; so the touch is
// on the image, where the finger covers the model:
// - pointing (the index finger out, the others curled) onto the model is a tap;
// - a pinch (thumb and index together) on the model grabs it, and moving it turns the
//   model as a drag does (js/touch.js); opening the fingers lets go.

// The landmarks: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_BASE = 5;
const INDEX_MIDDLE = 6;
const INDEX_TIP = 8;
const MIDDLE_MIDDLE = 10;
const MIDDLE_TIP = 12;

// A pinch closes below this share of the palm's length (wrist to the index's base),
// and opens above the second: apart, so that it doesn't flicker at the edge.
const PINCH_CLOSE = 0.3;
const PINCH_OPEN = 0.45;
// A hand whose wrist is this many watch radii from the watch's center wears it.
const WEARING = 2.5;
// After a tap, the next one waits this long, and for the finger to leave the model.
const TAP_REFRACTORY_MS = 700;

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
  return { pointer, pinching, pointing };
}

// From the hands seen in each frame to taps and drags on the model. Coordinates are the
// image's, 0 to 1 (MediaPipe's normalized ones). `update` takes the hands' landmarks,
// the watch as {x, y, radius} (or null), and `over(x, y)`, whether the model is there;
// it returns the events, and `cursor` is what to show of the free hand.
export class HandInteraction {
  cursor = null;
  #pinching = false;
  #grabbing = false;
  #last = null;
  #tapped = -Infinity;
  #armed = true;

  update(t, hands, watch, over) {
    const events = [];
    const hand = this.#freeHand(hands, watch);
    if (!hand) {
      if (this.#grabbing) events.push({ type: "release" });
      this.#grabbing = false;
      this.#pinching = false;
      this.#last = null;
      this.cursor = null;
      return events;
    }
    const { pointer, pinching, pointing } = handPose(hand, this.#pinching);
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
    this.cursor = { ...pointer, pinching, pointing, grabbing: this.#grabbing, over: onModel };
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
// on the CPU otherwise. Resolves to {detect(video, t) → landmarks of each hand, close()}.
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
    detect: (video, t) => landmarker.detectForVideo(video, t).landmarks ?? [],
    close: () => landmarker.close(),
  };
}
