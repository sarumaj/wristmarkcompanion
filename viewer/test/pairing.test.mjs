// The optical handshake's frames (public/js/pairing.js): the same frames as the test
// vectors (worked out on their own by tools/generate-channel-vectors.mjs, and drawn by
// the watch's Pairing.mc), read back from markers placed as the watch draws them, turned
// or not, in any order, a wrong reading outvoted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FrameReader, crc16, decodeFrames, encodeFrames, readFrame } from "../public/js/pairing.js";

const vectors = JSON.parse(await readFile(new URL("../../protocol/channel-vectors.json", import.meta.url), "utf8"));
const secret = Uint8Array.from(vectors.secret.match(/../g), (pair) => parseInt(pair, 16));

test("the frames and the CRC are the vectors'", () => {
  assert.equal(crc16([1, ...secret]), vectors.pairing.crc);
  assert.deepEqual(encodeFrames(secret), vectors.pairing.frames);
  // CRC-16/CCITT-FALSE's check value.
  assert.equal(crc16([..."123456789"].map((c) => c.charCodeAt(0))), 0x29b1);
});

test("decoding gives S back, and a changed nibble fails the CRC", () => {
  const nibbles = encodeFrames(secret).map((frame) => frame.slice(1));
  assert.deepEqual(decodeFrames(nibbles), { version: 1, secret });
  nibbles[5][1] ^= 4;
  assert.equal(decodeFrames(nibbles), null);
});

// A frame's markers as the detector reports them: 6 cells a marker, the data markers 7
// cells from the index, the whole turned by `angle` about (300, 200), `cell` pixels a cell.
function markersOf(frame, { angle = 0, cell = 10 } = {}) {
  const places = [[0, 0], [7, 0], [0, 7], [7, 7]];
  const turn = ({ x, y }) => ({
    x: 300 + x * Math.cos(angle) - y * Math.sin(angle),
    y: 200 + x * Math.sin(angle) + y * Math.cos(angle),
  });
  return frame.map((id, i) => {
    const [cx, cy] = places[i];
    // Clockwise from the marker's own top left.
    const corners = [[0, 0], [6, 0], [6, 6], [0, 6]].map(([x, y]) => turn({ x: (cx + x) * cell, y: (cy + y) * cell }));
    return { id, corners };
  });
}

test("a frame is read from its markers, also turned upside down or sideways", () => {
  const frame = vectors.pairing.frames[2];
  for (const angle of [0, 0.4, Math.PI / 2, Math.PI, -2]) {
    assert.deepEqual(readFrame(markersOf(frame, { angle })), { k: 2, nibbles: frame.slice(1) }, `angle ${angle}`);
  }
  // Without the index, or a data marker missing: nothing.
  assert.equal(readFrame(markersOf(frame).slice(1)), null);
  assert.equal(readFrame(markersOf(frame).slice(0, 3)), null);
});

test("the reader gets S from frames in any order, outvoting a wrong reading", () => {
  const reader = new FrameReader();
  const frames = vectors.pairing.frames;
  // A wrong reading of frame 4 first, then every frame in a shuffled order, twice.
  const wrong = [...frames[4]];
  wrong[2] ^= 1;
  let result = reader.add(markersOf(wrong));
  assert.deepEqual(result, { frames: 1, secret: null });
  const order = [7, 0, 12, 3, 9, 1, 11, 5, 2, 10, 6, 8, 4];
  for (const k of order) result = reader.add(markersOf(frames[k], { angle: k / 3 }));
  // All 13 seen, but frame 4 is tied with the wrong reading: the CRC catches it.
  for (const k of order) result = reader.add(markersOf(frames[k]));
  assert.equal(result.frames, 13);
  assert.deepEqual(result.secret, secret);
});
