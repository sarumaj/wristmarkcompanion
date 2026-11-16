// The desktop marker page: the watch's markers on a screen, for testing the
// viewer without a watch. ?id= opens one.
import { MARKER_CELLS, MARKER_COUNT, drawMarker } from "./markers.js";

const canvas = document.getElementById("marker");
const label = document.getElementById("marker-id");
const input = document.getElementById("id");
const context = canvas.getContext("2d");
// One cell of white around the marker: the quiet zone.
const QUIET_CELLS = 1;

function show(id) {
  const wrapped = ((id % MARKER_COUNT) + MARKER_COUNT) % MARKER_COUNT;
  const cell = Math.floor(canvas.width / (MARKER_CELLS + 2 * QUIET_CELLS));
  const offset = (canvas.width - MARKER_CELLS * cell) / 2;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawMarker(context, wrapped, offset, offset, cell);
  input.value = String(wrapped);
  label.textContent = `ID ${wrapped}`;
  document.body.dataset.markerId = String(wrapped);
  history.replaceState(null, "", `?id=${wrapped}`);
}

let current = Number(new URLSearchParams(location.search).get("id")) || 0;
document.getElementById("previous").addEventListener("click", () => show(--current));
document.getElementById("next").addEventListener("click", () => show(++current));
input.addEventListener("change", () => show((current = Number(input.value) || 0)));
document.getElementById("controls").addEventListener("submit", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight" || event.key === "ArrowUp") show(++current);
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") show(--current);
});
show(current);
