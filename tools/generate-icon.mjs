#!/usr/bin/env node
// Generates watch/resources/drawables/launcher_icon.png, the watch app's launcher
// icon: marker 0 of the watch's table (watch/source/MarkerDictionary.mc), with a
// cell of white quiet zone around it, as MarkerView draws it.
//
//   node tools/generate-icon.mjs           write the file
//   node tools/generate-icon.mjs --check   fail if it is stale
//
// 60x60 pixels, the D2 Mach 1's launcher icon size (launcherIcon in the device's
// compiler.json of the Connect IQ SDK): 8 cells of 7 pixels plus a 2 pixel margin
// on each side. A grayscale PNG written with node:zlib, so nothing is installed.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = join(ROOT, "watch/source/MarkerDictionary.mc");
const OUTPUT = join(ROOT, "watch/resources/drawables/launcher_icon.png");
const PIXELS = 60;
const CELL = 7;
const DATA = 4;

function fail(message) {
  console.error(`generate-icon: ${message}`);
  process.exit(1);
}

const codes = readFileSync(TABLE, "utf8").match(/const CODES = \[([\d,\s]+)\]/);
if (!codes) fail(`no CODES table in ${TABLE}`);
const code = Number(codes[1].split(",")[0]);

// Cell (row, col) of the 8x8 grid: the quiet zone (white), the marker's black
// border, and the data, bit 15 at the top left, row by row; 1 is white.
function white(row, col) {
  if (row === 0 || col === 0 || row === 7 || col === 7) return true;
  if (row === 1 || col === 1 || row === 6 || col === 6) return false;
  const bit = DATA * DATA - 1 - ((row - 2) * DATA + (col - 2));
  return ((code >> bit) & 1) === 1;
}

const margin = (PIXELS - 8 * CELL) / 2;
const rows = [];
for (let y = 0; y < PIXELS; y++) {
  const row = Buffer.alloc(1 + PIXELS); // filter byte 0, then one gray byte per pixel
  for (let x = 0; x < PIXELS; x++) {
    const r = Math.floor((y - margin) / CELL);
    const c = Math.floor((x - margin) / CELL);
    const inside = r >= 0 && r < 8 && c >= 0 && c < 8;
    row[1 + x] = inside && white(r, c) ? 255 : 0; // the margin black, as the display
  }
  rows.push(row);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(PIXELS, 0);
header.writeUInt32BE(PIXELS, 4);
header[8] = 8; // bit depth
header[9] = 0; // grayscale
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

if (process.argv.includes("--check")) {
  let current;
  try {
    current = readFileSync(OUTPUT);
  } catch {
    fail(`${OUTPUT} is missing: run node tools/generate-icon.mjs`);
  }
  if (!current.equals(png)) fail(`${OUTPUT} is stale: run node tools/generate-icon.mjs`);
} else {
  writeFileSync(OUTPUT, png);
  console.log(`wrote ${OUTPUT} (${png.length} bytes)`);
}
