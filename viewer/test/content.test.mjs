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
