// The desktop marker page: the watch's markers on a screen, for testing the
// viewer without a watch. ?id= opens one. Next and previous step through the IDs
// content.json gives a model, as the watch does; any ID can be typed in.
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
  const name = names.get(wrapped);
  label.textContent = name ? `ID ${wrapped} · ${name}` : `ID ${wrapped} (no model)`;
  document.body.dataset.markerId = String(wrapped);
  history.replaceState(null, "", `?id=${wrapped}`);
}

// The models' names by ID, from content.json; without it, every ID is stepped through.
const names = new Map();
let current = Number(new URLSearchParams(location.search).get("id")) || 0;

// The next (1) or previous (-1) ID with a model, or simply the next one.
function step(delta) {
  const ids = [...names.keys()].sort((a, b) => a - b);
  if (ids.length === 0) return show((current += delta));
  const index = ids.findIndex((id) => (delta > 0 ? id > current : id >= current));
  const at = delta > 0 ? (index === -1 ? 0 : index) : (index <= 0 ? ids.length - 1 : index - 1);
  show((current = ids[at]));
}

document.getElementById("previous").addEventListener("click", () => step(-1));
document.getElementById("next").addEventListener("click", () => step(1));
input.addEventListener("change", () => show((current = Number(input.value) || 0)));
document.getElementById("controls").addEventListener("submit", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
  if (event.target === input) return;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") step(1);
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") step(-1);
});
show(current);
fetch("content.json")
  .then((response) => response.json())
  .then(({ markers }) => {
    for (const [id, { name }] of Object.entries(markers)) names.set(Number(id), name);
    show(current);
  })
  .catch(() => {});
