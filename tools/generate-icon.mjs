#!/usr/bin/env node
// Generates the icons, all of them marker 0 of the watch's table
// (watch/source/MarkerDictionary.mc) in a cell of white quiet zone, as MarkerView
// draws it:
//
// - watch/resources/drawables/launcher_icon.png: the watch app's launcher icon,
//   60x60, the D2 Mach 1's size (launcherIcon in the device's compiler.json of the
//   Connect IQ SDK), on black like the app's screen;
// - docs/store-assets/icon-500.png and icon-128.png: the store's icon and its
//   optional on-device icon (Garmin's Connect IQ brand guidelines: 500x500 and
//   128x128, sRGB, 10 px of padding, no black or transparent background, no text).
//   Their blue, #0055AA, is in the 64-color palette the guidelines ask for on
//   memory-in-pixel displays, so one icon serves both kinds.
//
//   node tools/generate-icon.mjs           write the files
//   node tools/generate-icon.mjs --check   fail if one is stale
//
// RGB PNGs written with node:zlib, so nothing is installed.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = join(ROOT, "watch/source/MarkerDictionary.mc");
const DATA = 4;
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
const STORE_BLUE = [0x00, 0x55, 0xaa];

// Each icon: its size, the cell size of the 8x8 grid (marker and quiet zone), and
// the color around it.
const ICONS = [
  { path: "watch/resources/drawables/launcher_icon.png", size: 60, cell: 7, background: BLACK },
  { path: "docs/store-assets/icon-500.png", size: 500, cell: 42, background: STORE_BLUE },
  { path: "docs/store-assets/icon-128.png", size: 128, cell: 11, background: STORE_BLUE },
];

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

function render({ size, cell, background }) {
  const margin = Math.floor((size - 8 * cell) / 2);
  if (margin < 0) fail(`a ${cell}-pixel cell does not fit ${size} pixels`);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + 3 * size); // filter byte 0, then RGB per pixel
    for (let x = 0; x < size; x++) {
      const r = Math.floor((y - margin) / cell);
      const c = Math.floor((x - margin) / cell);
      const inside = y >= margin && x >= margin && r < 8 && c < 8;
      const color = inside ? (white(r, c) ? WHITE : BLACK) : background;
      row.set(color, 1 + 3 * x);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const check = process.argv.includes("--check");
for (const icon of ICONS) {
  const file = join(ROOT, icon.path);
  const png = render(icon);
  if (check) {
    let current;
    try {
      current = readFileSync(file);
    } catch {
      fail(`${icon.path} is missing: run node tools/generate-icon.mjs`);
    }
    if (!current.equals(png)) fail(`${icon.path} is stale: run node tools/generate-icon.mjs`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
    console.log(`wrote ${icon.path} (${png.length} bytes)`);
  }
}
