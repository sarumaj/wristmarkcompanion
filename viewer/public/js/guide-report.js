// The guided device test's report: docs/dev/device-tests.md's tables, filled in from
// the results, as Markdown to paste into the document or a message.
import { farthest } from "./guide-metrics.js";

export const SETUP_FIELDS = [
  ["date", "Date"],
  ["watch", "Watch, firmware version"],
  ["markerMm", "Marker's black square, measured (mm)"],
  ["phone", "Phone, model"],
  ["browser", "Phone browser and version"],
  ["laptop", "Laptop and webcam (if tested)"],
  ["brightness", "Watch brightness setting"],
  ["displayMode", "Watch display mode (always on, gesture, ...)"],
];

const cell = (value) => (value === null || value === undefined || value === "" ? "-" : String(value).replaceAll("|", "\\|").replaceAll("\n", " "));
const percent = (rate) => (rate === null || rate === undefined ? "-" : `${Math.round(rate * 100)}`);
const fixed = (value, digits = 0) => (value === null || value === undefined ? "-" : value.toFixed(digits));
const light = (result) => (result.night ? "red light" : "normal");

// A Markdown table with its columns padded to the same width.
export function table(header, rows) {
  const all = [header, ...rows].map((row) => row.map(cell));
  const widths = header.map((_, column) => Math.max(3, ...all.map((row) => row[column].length)));
  const line = (row) => `| ${row.map((value, column) => value.padEnd(widths[column])).join(" | ")} |`;
  return [line(all[0]), `|${widths.map((width) => "-".repeat(width + 2)).join("|")}|`, ...all.slice(1).map(line)].join("\n");
}

function steadyNote(result) {
  const { flips, jitterMm, jitterDegrees } = result.summary;
  const measured = `measured: ${result.auto}, ±${fixed(jitterMm, 1)} mm, ±${fixed(jitterDegrees, 1)}°${flips ? `, ${flips} flips` : ""}`;
  return [result.note, result.steady !== result.auto ? measured : ""].filter(Boolean).join("; ");
}

export function report(state, { viewer = "" } = {}) {
  const results = state.results ?? [];
  const of = (kind) => results.filter((result) => result.kind === kind);
  const out = ["# Device test results", ""];
  if (viewer) {
    out.push(`Measured with the viewer's guided test (${viewer}).`, "");
  }
  out.push(table(["What", "Value"], SETUP_FIELDS.map(([key, label]) => [label, state.setup?.[key]])), "");

  const range = of("range");
  out.push("## 1. Range", "");
  out.push(
    table(
      ["Lighting", "Display", "Measured (cm)", "Shown (mm)", "Detection (%)", "FPS", "Detect time (ms)", "Steady", "Notes"],
      range.map((r) => [r.lighting, light(r), r.distanceCm, fixed(r.summary.distance), percent(r.summary.rate), fixed(r.summary.fps), fixed(r.summary.detectMs, 1), r.steady, steadyNote(r)]),
    ),
    "",
  );
  const best = Object.entries(farthest(range));
  if (best.length) {
    out.push("**The farthest distance with at least 90 % detection:**", "");
    out.push(...best.map(([key, cm]) => `- ${key}: ${cm === null ? "none of the measured" : `${cm} cm`}`), "");
  }

  out.push("## 2. Angle", "");
  out.push(
    table(
      ["Angle (°)", "Measured tilt (°)", "Display", "Detection (%)", "Steady", "Notes"],
      of("angle").map((r) => [r.angle, fixed(r.summary.tilt), light(r), percent(r.summary.rate), r.steady, steadyNote(r)]),
    ),
    "",
  );

  out.push("## 3. Session length", "");
  out.push(
    table(
      ["Run", "Started by", "Display", "Dims after (s)", "Off after (s)", "Marker still detected while dimmed?", "After a press: on again?", "Notes"],
      of("session").map((r, i) => [
        i + 1,
        r.startedBy,
        light(r),
        fixed(r.dimsAfter),
        fixed(r.offAfter),
        r.rateWhileDimmed === null ? "-" : `${percent(r.rateWhileDimmed)} % of frames`,
        r.onAgain,
        r.note,
      ]),
    ),
    "",
  );
  const battery = state.battery ?? {};
  out.push(`Battery before and after 10 minutes of the app (with presses to keep it on): ${cell(battery.before)} % → ${cell(battery.after)} %.`, "");

  out.push("## 4. The models", "");
  out.push(
    table(
      ["ID", "Model", "Sits on the watch?", "Smooth?", "FPS", "Notes"],
      of("model").map((r) => [r.id, r.name, r.sits, r.smooth, fixed(r.summary.fps), [r.sky && `matches the sky: ${r.sky}`, r.note].filter(Boolean).join("; ")]),
    ),
    "",
  );

  out.push("## 5. Anything else", "", state.notes?.trim() || "-", "");
  return out.join("\n");
}
