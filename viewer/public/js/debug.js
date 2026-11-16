// The debug overlay's numbers, over the last second of frames: frames per second,
// the share of frames the marker was found in (the detection rate), and how long
// detection took. These are what the range tests (milestone 4) record.

const WINDOW_MS = 1000;
// The overlay's text is rewritten at most this often, so that it can be read.
const RENDER_EVERY_MS = 250;

export class DebugStats {
  constructor() {
    this.frames = [];
    this.lastRender = -Infinity;
  }

  // A processed frame at `now` (ms): detection took `detectMs`, and found the marker
  // or not.
  frame(now, detectMs, found) {
    this.frames.push({ now, detectMs, found });
    while (this.frames.length && this.frames[0].now <= now - WINDOW_MS) {
      this.frames.shift();
    }
  }

  // The numbers of the last second.
  summary() {
    const count = this.frames.length;
    const found = this.frames.filter((frame) => frame.found).length;
    const detectMs = count ? this.frames.reduce((sum, frame) => sum + frame.detectMs, 0) / count : 0;
    return { fps: count, rate: count ? found / count : 0, detectMs };
  }

  // The overlay's text, with what the viewer adds (ID, distance, sizes).
  text({ id, distance, camera, detection }) {
    const { fps, rate, detectMs } = this.summary();
    return [
      `ID          ${id ?? "-"}`,
      `distance    ${distance === null ? "-" : `${distance} mm`}`,
      `FPS         ${fps}`,
      `detection   ${Math.round(rate * 100)} % of frames`,
      `detect time ${detectMs.toFixed(1)} ms`,
      `camera      ${camera}`,
      `detected at ${detection}`,
    ].join("\n");
  }

  render(element, now, values) {
    if (now - this.lastRender < RENDER_EVERY_MS) {
      return;
    }
    this.lastRender = now;
    element.textContent = this.text(values);
  }
}
