// The mapping from marker IDs to what the viewer shows: content.json, read once and
// checked, so that a wrong entry stops the viewer with its reason instead of
// showing nothing. An ID without an entry shows the axis gizmo and says so.
import { MARKER_COUNT } from "./markers.js";

// content.json's data, checked against the models the viewer knows: a Map from
// marker ID to {model, name}. Throws on anything unexpected.
export function parseContent(data, modelNames) {
  if (!data || typeof data !== "object" || !data.markers || typeof data.markers !== "object") {
    throw new Error('content.json: expected an object with "markers"');
  }
  const unknownKeys = Object.keys(data).filter((key) => key !== "markers");
  if (unknownKeys.length) {
    throw new Error(`content.json: unknown keys ${unknownKeys.join(", ")}`);
  }
  const content = new Map();
  for (const [key, entry] of Object.entries(data.markers)) {
    const id = Number(key);
    if (!/^\d+$/.test(key) || id >= MARKER_COUNT) {
      throw new Error(`content.json: marker "${key}" is not an ID in 0-${MARKER_COUNT - 1}`);
    }
    if (!entry || typeof entry.name !== "string" || !entry.name) {
      throw new Error(`content.json: marker ${id} has no name`);
    }
    if (!modelNames.includes(entry.model)) {
      throw new Error(`content.json: marker ${id}'s model "${entry.model}" is not one of ${modelNames.join(", ")}`);
    }
    const extra = Object.keys(entry).filter((field) => field !== "model" && field !== "name");
    if (extra.length) {
      throw new Error(`content.json: marker ${id} has unknown fields ${extra.join(", ")}`);
    }
    content.set(id, { model: entry.model, name: entry.name });
  }
  return content;
}

export async function loadContent(url, modelNames) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`content.json: ${response.status} ${response.statusText}`);
  }
  return parseContent(await response.json(), modelNames);
}
