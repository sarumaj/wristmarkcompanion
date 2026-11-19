// The model's size, by hand: two fingers pinching on a phone, the mouse wheel or a
// trackpad's pinch on a laptop, a double tap or double click back to 1. One finger
// still scrolls the page (the stage's touch-action is pan-y).
import { OWN } from "./touch.js";

const MIN = 0.3;
const MAX = 6;
// How much one wheel step (100 pixels of deltaY) zooms: about 10 %.
const WHEEL = 0.001;

export function zoomControl(element, onChange) {
  let zoom = 1;
  const set = (value) => {
    zoom = Math.min(MAX, Math.max(MIN, value));
    onChange(zoom);
  };

  element.addEventListener(
    "wheel",
    (event) => {
      // Only over a model, not over the stage's own panels (the debug view scrolls), and
      // the page scrolls where there is nothing to zoom.
      if (!document.body.dataset.model || event.target.closest(OWN)) return;
      event.preventDefault();
      // A trackpad's pinch arrives as a wheel event with ctrlKey and finer steps.
      set(zoom * Math.exp(-event.deltaY * (event.ctrlKey ? WHEEL * 8 : WHEEL)));
    },
    { passive: false },
  );

  // Two pointers down: the ratio of their distance to the distance they started at.
  const pointers = new Map();
  let pinch = null;
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  element.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      pinch = { distance: distance(), zoom };
    }
  });
  element.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size === 2 && pinch.distance > 0) {
      set(pinch.zoom * (distance() / pinch.distance));
    }
  });
  const up = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    element.addEventListener(type, up);
  }
  // Not a quick double press of a button on the stage.
  element.addEventListener("dblclick", (event) => {
    if (!event.target.closest(OWN)) set(1);
  });

  return {
    get value() {
      return zoom;
    },
    // For the keyboard: + and - in the viewer.
    set,
  };
}
