// The debug view's drawing over the camera's image (the canvas #marks): what the
// detection and the hand tracking see, to tell why a gesture did or didn't come.
// - the marker's corners as found (refined), its ID, and the region it was looked for
//   in (dashed) when it was found there;
// - each hand's 21 points and bones: the free hand's in the accent color with its state
//   (open, pointing, pinching, grabbing) and its smoothed pointer, the hand wearing the
//   watch in grey;
// - the watch's turn speed against a flick's.
import { BONES } from "./hands.js";
import { FLICK_DEGREES_PER_SECOND } from "./gestures.js";

const ACCENT = "#5b8cff";
const FOUND = "#3ddc84";
const MUTED = "rgb(200 200 200 / 70%)";

// `marker` {id, corners} and `region` {left, top, w, h} in the frame's pixels (`frame`
// {width, height}); `hands` [{landmarks, free}] and `cursor` in the image's 0 to 1;
// `state` the free hand's pose (js/hands.js handPose); `turnSpeed` degrees a second.
export function drawMarks(canvas, { frame, marker, region, hands = [], state, cursor, turnSpeed }) {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(box.width * ratio);
  const height = Math.round(box.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, width, height);
  g.lineWidth = 2 * ratio;
  g.font = `${12 * ratio}px system-ui, sans-serif`;
  const label = (text, x, y, color) => {
    const w = g.measureText(text).width + 8 * ratio;
    g.fillStyle = "rgb(0 0 0 / 60%)";
    g.fillRect(x, y - 14 * ratio, w, 18 * ratio);
    g.fillStyle = color;
    g.fillText(text, x + 4 * ratio, y);
  };
  // The frame's pixels (a pixel's center at its index) and the image's 0 to 1, to the canvas.
  const fromFrame = (p) => [((p.x + 0.5) / frame.width) * width, ((p.y + 0.5) / frame.height) * height];
  const fromImage = (p) => [p.x * width, p.y * height];

  if (region) {
    g.setLineDash([6 * ratio, 4 * ratio]);
    g.strokeStyle = MUTED;
    const [x, y] = fromFrame({ x: region.left - 0.5, y: region.top - 0.5 });
    g.strokeRect(x, y, (region.w / frame.width) * width, (region.h / frame.height) * height);
    g.setLineDash([]);
  }
  if (marker) {
    const points = marker.corners.map(fromFrame);
    g.strokeStyle = FOUND;
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.stroke();
    // The first corner (the marker's own top left), larger.
    g.fillStyle = FOUND;
    points.forEach(([x, y], i) => {
      g.beginPath();
      g.arc(x, y, (i ? 2.5 : 4.5) * ratio, 0, 2 * Math.PI);
      g.fill();
    });
    const top = points.reduce((a, b) => (b[1] < a[1] ? b : a));
    const speed = Math.round(turnSpeed ?? 0);
    label(`#${marker.id} · turning ${speed}°/s (flick ${FLICK_DEGREES_PER_SECOND})`, top[0], top[1] - 10 * ratio, speed > FLICK_DEGREES_PER_SECOND ? "#ffcc4d" : FOUND);
  }
  for (const { landmarks, free } of hands) {
    const color = free ? ACCENT : MUTED;
    const points = landmarks.map(fromImage);
    g.strokeStyle = color;
    g.beginPath();
    for (const [a, b] of BONES) {
      g.moveTo(...points[a]);
      g.lineTo(...points[b]);
    }
    g.stroke();
    g.fillStyle = color;
    for (const [x, y] of points) {
      g.beginPath();
      g.arc(x, y, 3 * ratio, 0, 2 * Math.PI);
      g.fill();
    }
    const [wx, wy] = points[0];
    if (free && state) {
      const words = [state.grabbing ? "grabbing" : state.pinching ? "pinching" : state.pointing ? "pointing" : state.open ? "open" : "relaxed"];
      label(words.join(" "), wx + 8 * ratio, wy + 18 * ratio, color);
    } else if (!free) {
      label("wearing the watch", wx + 8 * ratio, wy + 18 * ratio, color);
    }
  }
  if (cursor) {
    const [x, y] = fromImage(cursor);
    g.strokeStyle = "#fff";
    g.beginPath();
    g.moveTo(x - 8 * ratio, y);
    g.lineTo(x + 8 * ratio, y);
    g.moveTo(x, y - 8 * ratio);
    g.lineTo(x, y + 8 * ratio);
    g.stroke();
  }
}
