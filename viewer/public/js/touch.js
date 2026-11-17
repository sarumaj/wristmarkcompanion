// One finger or the mouse on the model: a tap, and a drag that turns it like a dial
// about the watch's center. Two fingers belong to the pinch (zoom.js): a second finger
// ends the drag and no tap follows. Taps and drags on the stage's own buttons and
// panels are theirs, not the model's.

// Moved further than this (pixels) is a drag, not a tap; held longer is no tap either.
const TAP_DISTANCE = 8;
const TAP_MS = 400;
const OWN = "button, a, input, select, .debug, .guide, .intro, .failure";

// `handlers.tap(x, y)` in the window's pixels (clientX, clientY); `handlers.drag(x, y, dx, dy)` with the
// pointer's position and its movement since the last call; `handlers.release()` when a
// drag ends.
export function touchControl(element, handlers) {
  const pointers = new Set();
  let press = null;

  const local = (event) => ({ x: event.clientX, y: event.clientY });

  element.addEventListener("pointerdown", (event) => {
    pointers.add(event.pointerId);
    if (pointers.size > 1) {
      if (press?.dragging) handlers.release();
      press = null;
      return;
    }
    if (event.button !== 0 || event.target.closest(OWN)) return;
    const at = local(event);
    press = { id: event.pointerId, start: at, last: at, t: event.timeStamp, dragging: false };
  });

  element.addEventListener("pointermove", (event) => {
    if (!press || event.pointerId !== press.id) return;
    const at = local(event);
    if (!press.dragging && Math.hypot(at.x - press.start.x, at.y - press.start.y) > TAP_DISTANCE) {
      press.dragging = true;
      element.setPointerCapture?.(event.pointerId);
    }
    if (press.dragging) handlers.drag(at.x, at.y, at.x - press.last.x, at.y - press.last.y);
    press.last = at;
  });

  const up = (event) => {
    pointers.delete(event.pointerId);
    if (!press || event.pointerId !== press.id) return;
    if (press.dragging) handlers.release();
    else if (event.type === "pointerup" && event.timeStamp - press.t < TAP_MS) handlers.tap(press.start.x, press.start.y);
    press = null;
  };
  for (const type of ["pointerup", "pointercancel"]) element.addEventListener(type, up);
}

// A turn that follows the pointer around `center` and coasts on after release, slowing
// down: `drag` from the pointer, `step` each frame, `angle` to apply.
export class Turntable {
  angle = 0;
  #velocity = 0;
  #last = 0;

  // The pointer moved by (dx, dy) to (x, y), around a center at (cx, cy), at time t (ms).
  // The angle changes as much as the pointer's angle around the center does; y grows
  // downward on screen, so a clockwise drag on screen is negative here.
  drag(x, y, dx, dy, cx, cy, t) {
    const before = Math.atan2(-(y - dy - cy), x - dx - cx);
    const after = Math.atan2(-(y - cy), x - cx);
    let delta = after - before;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    // Near the center the angle jumps about; a drag there turns little.
    if (Math.hypot(x - cx, y - cy) < 12) delta = 0;
    this.angle += delta;
    const dt = Math.max(1, t - this.#last);
    this.#velocity = this.#last ? 0.6 * this.#velocity + 0.4 * (delta / dt) : 0;
    this.#last = t;
    this.dragging = true;
  }

  release() {
    this.dragging = false;
    this.#last = 0;
  }

  // Coasting: the speed halves about every 300 ms, and stops below a crawl.
  step(dt) {
    if (this.dragging) return;
    this.angle += this.#velocity * dt;
    this.#velocity *= Math.exp(-dt / 430);
    if (Math.abs(this.#velocity) < 0.00005) this.#velocity = 0;
  }

  // For the keyboard: a fixed turn.
  turn(radians) {
    this.angle += radians;
    this.#velocity = 0;
  }

  reset() {
    this.angle = 0;
    this.#velocity = 0;
    this.#last = 0;
    this.dragging = false;
  }
}
