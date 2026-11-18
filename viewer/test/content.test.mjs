// content.json's check (public/js/content.js), without a browser: every mistake
// stops the viewer with its reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContent } from "../public/js/content.js";

const MODELS = ["cube", "knot"];

test("a valid mapping gives each ID its model and name", () => {
  const content = parseContent({ markers: { 0: { model: "cube", name: "Cube" }, 49: { model: "knot", name: "Knot" } } }, MODELS);
  assert.deepEqual([...content], [
    [0, { model: "cube", name: "Cube" }],
    [49, { model: "knot", name: "Knot" }],
  ]);
});

test("mistakes are refused with their reason", () => {
  const cases = [
    [null, /expected an object/],
    [{}, /expected an object/],
    [{ markers: {}, extra: 1 }, /unknown keys extra/],
    [{ markers: { 50: { model: "cube", name: "x" } } }, /"50" is not an ID in 0-49/],
    [{ markers: { "-1": { model: "cube", name: "x" } } }, /"-1" is not an ID/],
    [{ markers: { "1.5": { model: "cube", name: "x" } } }, /"1.5" is not an ID/],
    [{ markers: { 1: { model: "cube" } } }, /marker 1 has no name/],
    [{ markers: { 1: { model: "teapot", name: "x" } } }, /model "teapot" is not one of cube, knot/],
    [{ markers: { 1: { model: "cube", name: "x", scale: 2 } } }, /unknown fields scale/],
  ];
  for (const [data, message] of cases) {
    assert.throws(() => parseContent(data, MODELS), message, JSON.stringify(data));
  }
});

// The documentation's pictures (tools/render-models.mjs): each mapped model has one, and
// docs/user/models.md's table shows it in the marker's row; no picture is left of a model gone.
test("every mapped model has its picture, and the table in docs/user/models.md shows it", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const root = new URL("../../", import.meta.url);
  const { markers } = JSON.parse(await readFile(new URL("viewer/public/content.json", root), "utf8"));
  const pictures = new Set(await readdir(new URL("docs/user/images/models/", root)));
  const table = await readFile(new URL("docs/user/models.md", root), "utf8");
  const models = new Set(Object.values(markers).map((entry) => entry.model));
  for (const [id, { model, name }] of Object.entries(markers)) {
    assert.ok(pictures.has(`${model}.webp`), `docs/user/images/models/${model}.webp is missing: run viewer/tools/render-models.mjs`);
    const row = new RegExp(`^\\| ${id} +\\| !\\[${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\(images/models/${model}\\.webp\\) +\\|`, "m");
    assert.ok(row.test(table), `docs/user/models.md has no row for marker ${id} with its picture`);
  }
  const stale = [...pictures].filter((file) => !models.has(file.replace(/\.webp$/, "")));
  assert.deepEqual(stale, [], "pictures of models no longer mapped");
});

// The Android app's store listing (fastlane/, docs/dev/google-play.md), which F-Droid and
// Google Play read: within both stores' limits, and one line per paragraph (the stores keep
// line breaks as they are).
test("the Android app's store texts fit the stores' limits", async () => {
  const { readFile } = await import("node:fs/promises");
  const listing = new URL("../../fastlane/metadata/android/en-US/", import.meta.url);
  const limits = { "title.txt": 30, "short_description.txt": 80, "full_description.txt": 4000 };
  for (const [file, limit] of Object.entries(limits)) {
    const text = (await readFile(new URL(file, listing), "utf8")).replace(/\n$/, "");
    assert.ok(text.length > 0 && text.length <= limit, `${file}: ${text.length} characters, at most ${limit}`);
    assert.doesNotMatch(text, /[^\n]\n[^\n]/, `${file}: a line break inside a paragraph`);
  }
});
