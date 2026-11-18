// How to play with a model, shown rather than told: a small animated picture of each move
// the model takes (a tap, a flick, a shake, a twist of the wrist, a tilt of the watch) with
// a line of text, one after the other, the first time that model is seen, and again from
// the "?" button next to its actions. The same pictures, still, are on the action buttons,
// so the button and the move it stands for look alike.
//
// The pictures are SVG built here and animated by style.css (classes `move-<kind>`): the
// page's Content-Security-Policy allows no inline styles.

const SVG = "http://www.w3.org/2000/svg";
// Which models have shown their how-to on this device (localStorage), so it comes once.
const SEEN_KEY = "wristmark.coached";
// How long each move is shown.
const MOVE_MS = 2600;

export const MOVES = {
  tap: "Tap the model",
  flick: "Flick your wrist: a quick turn and back",
  shake: "Shake your wrist: quickly left and right",
  twist: "Twist the watch about its center",
  tilt: "Tilt the watch slowly",
};

// The moves a model's guide (MODEL_GUIDES) asks for, in order, each once.
export function movesOf(guide) {
  if (!guide) return [];
  const moves = (guide.actions ?? []).map(({ touch, sensor, gesture }) => (touch ? "tap" : sensor ? null : gesture));
  if (guide.tilt) moves.push("tilt");
  return [...new Set(moves)].filter((move) => move in MOVES);
}

function element(name, attributes = {}, children = []) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

// A watch seen from the front: its case, its display and the straps, as a group that the
// animation moves.
function watch() {
  return element("g", { class: "move-watch" }, [
    element("rect", { x: 26, y: 6, width: 12, height: 14, rx: 3, class: "move-strap" }),
    element("rect", { x: 26, y: 44, width: 12, height: 14, rx: 3, class: "move-strap" }),
    element("circle", { cx: 32, cy: 32, r: 14, class: "move-case" }),
    element("circle", { cx: 32, cy: 32, r: 10.5, class: "move-face" }),
    element("rect", { x: 28, y: 28, width: 8, height: 8, class: "move-marker" }),
  ]);
}

// The picture of `kind`; `still` for a button's icon (no motion lines, no animation).
export function moveIcon(kind, { still = false } = {}) {
  const parts = [];
  if (kind === "tap") {
    parts.push(
      element("circle", { cx: 32, cy: 32, r: 16, class: "move-ripple" }),
      element("circle", { cx: 32, cy: 32, r: 6, class: "move-dot" }),
      // A finger from the lower right, its tip at the dot.
      element("g", { class: "move-hand" }, [element("rect", { x: 30, y: 31, width: 10, height: 28, rx: 5, transform: "rotate(-35 35 35)", class: "move-finger" })]),
    );
  } else {
    parts.push(watch());
    if (!still && kind === "twist") {
      parts.push(element("path", { d: "M14 22 A20 20 0 0 1 50 22", class: "move-arrow" }), element("path", { d: "M50 22 l-6 -1 M50 22 l1 -6", class: "move-arrow" }));
    }
    if (!still && kind === "shake") {
      parts.push(element("path", { d: "M6 26 v12 M58 26 v12", class: "move-lines" }));
    }
    if (!still && kind === "flick") {
      parts.push(element("path", { d: "M8 18 q-4 14 0 28 M56 18 q4 14 0 28", class: "move-lines" }));
    }
  }
  return element("svg", { viewBox: "0 0 64 64", class: `move move-${kind}${still ? " move-still" : ""}`, "aria-hidden": "true", focusable: "false" }, parts);
}

function seenModels() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) ?? []);
  } catch {
    return new Set();
  }
}

// The card on the stage (`card`, holding a picture and a caption), playing a model's moves.
export class Coach {
  constructor(card) {
    this.card = card;
    this.picture = card.querySelector(".coach-picture");
    this.caption = card.querySelector(".coach-caption");
    this.timer = 0;
  }

  // The model `name` came into view: its moves, if it hasn't shown them on this device.
  offer(name, moves) {
    const seen = seenModels();
    if (!moves.length || seen.has(name)) return;
    seen.add(name);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    } catch {
      // No storage (a private window): it shows each visit.
    }
    this.play(moves);
  }

  play(moves) {
    this.stop();
    if (!moves.length) return;
    let index = 0;
    const next = () => {
      if (index === moves.length) {
        this.stop();
        return;
      }
      const move = moves[index++];
      this.picture.replaceChildren(moveIcon(move));
      this.caption.textContent = MOVES[move];
      this.card.hidden = false;
      this.timer = setTimeout(next, MOVE_MS);
    };
    next();
  }

  stop() {
    clearTimeout(this.timer);
    this.card.hidden = true;
  }
}
