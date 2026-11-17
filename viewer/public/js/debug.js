// The debug overlay's numbers, over the last second of frames: frames per second,
// the share of frames the marker was found in (the detection rate), and how long
// detection took; and a chart of the last ten seconds of both rates. These are what
// the range tests (docs/device-tests.md) record.

const WINDOW_MS = 1000;
// The overlay is redrawn at most this often, so that it can be read.
const RENDER_EVERY_MS = 250;
// The chart's span, in samples of RENDER_EVERY_MS.
const HISTORY = 40;

// A value's health, for its color: good, fair or poor.
function health(value, good, fair, higherIsBetter = true) {
  if (higherIsBetter ? value >= good : value <= good) return "good";
  if (higherIsBetter ? value >= fair : value <= fair) return "fair";
  return "poor";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class DebugStats {
  constructor() {
    this.frames = [];
    this.lastRender = -Infinity;
    this.history = [];
    this.built = null;
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

  // The overlay's rows, [key, label, value, health or null], with what the viewer
  // adds (ID, distance, sizes).
  rows({ id, distance, camera, detection, gesture }) {
    const { fps, rate, detectMs } = this.summary();
    return [
      ["id", "Marker", id === null || id === undefined ? "–" : String(id), id === null || id === undefined ? "poor" : "good"],
      ["distance", "Distance", distance === null || distance === undefined ? "–" : `${distance} mm`, null],
      ["fps", "FPS", String(fps), health(fps, 24, 15)],
      ["detection", "Detected", `${Math.round(rate * 100)} %`, health(rate, 0.9, 0.5)],
      ["detect-time", "Detect time", `${detectMs.toFixed(1)} ms`, health(detectMs, 15, 30, false)],
      ["camera", "Camera", camera, null],
      ["detected-at", "Detected at", detection, null],
      ["gesture", "Gesture", gesture ?? "–", null],
    ];
  }

  // The overlay's structure, built once: a row per number, and the chart.
  build(panel) {
    const list = element("dl", "debug-rows");
    const values = {};
    for (const [key, label] of this.rows({ camera: "", detection: "" })) {
      const row = element("div");
      row.dataset.key = key;
      values[key] = element("dd");
      row.append(element("dt", "", label), values[key]);
      list.append(row);
    }
    const chart = element("canvas", "debug-chart");
    chart.width = 360;
    chart.height = 72;
    const legend = element("p", "debug-legend");
    legend.append(element("span", "debug-key-rate", "detected"), element("span", "debug-key-fps", "FPS"), element("span", "", "last 10 s"));
    panel.replaceChildren(element("p", "debug-title", "Debug"), list, chart, legend);
    this.built = { panel, values, chart };
  }

  // The last ten seconds of the detection rate and the FPS (60 at the top), as lines
  // over guides at 50 % and 90 %.
  draw(chart) {
    const context = chart.getContext("2d");
    const { width, height } = chart;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(255, 255, 255, 0.14)";
    context.lineWidth = 1;
    for (const level of [0.5, 0.9]) {
      context.beginPath();
      context.moveTo(0, height * (1 - level));
      context.lineTo(width, height * (1 - level));
      context.stroke();
    }
    const line = (key, color, scale) => {
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.beginPath();
      this.history.forEach((sample, i) => {
        const x = width - ((this.history.length - 1 - i) / (HISTORY - 1)) * width;
        const y = height * 0.04 + height * 0.92 * (1 - Math.min(1, sample[key] / scale));
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    };
    line("fps", "#7aa2ff", 60);
    line("rate", "#34d399", 1);
  }

  render(panel, now, values) {
    if (now - this.lastRender < RENDER_EVERY_MS) {
      return;
    }
    this.lastRender = now;
    if (this.built?.panel !== panel) {
      this.build(panel);
    }
    for (const [key, , value, state] of this.rows(values)) {
      const cell = this.built.values[key];
      cell.textContent = value;
      if (state) cell.dataset.health = state;
      else delete cell.dataset.health;
    }
    const { fps, rate } = this.summary();
    this.history.push({ fps, rate });
    if (this.history.length > HISTORY) this.history.shift();
    this.draw(this.built.chart);
  }
}
