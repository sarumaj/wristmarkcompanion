#!/usr/bin/env node
// Generates protocol/channel-vectors.json, and its copy for the watch's unit tests
// (watch/source/ChannelVectors.mc): the control channel's test vectors
// (docs/decisions/004-control-channel.md#test-vectors). From a fixed secret S, the keys
// HKDF derives, and envelopes sealed with fixed runs, counters, times and IVs, made here
// with Node's crypto: an implementation of its own, so that the viewer's (WebCrypto,
// viewer/test/channel.test.mjs) and the watch's (Toybox.Cryptography, its unit tests) are
// each checked against something they didn't make. Also envelopes a receiver must refuse,
// and why.
//
//   node tools/generate-channel-vectors.mjs           write the file
//   node tools/generate-channel-vectors.mjs --check   fail if it is stale

import { createCipheriv, createHash, createHmac, hkdfSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "protocol/channel-vectors.json");
const WATCH = join(ROOT, "watch/source/ChannelVectors.mc");
const SALT = "wristmark/channel/v1";
const DIRECTIONS = { toWatch: 1, toViewer: 2 };

const hex = (bytes) => Buffer.from(bytes).toString("hex");
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const derive = (secret, info, length) => Buffer.from(hkdfSync("sha256", secret, SALT, info, length));

const secret = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");
const keys = Object.fromEntries(
  [["id", 16], ["token/watch", 32], ["token/viewer", 32], ["to-watch/enc", 32], ["to-watch/mac", 32], ["to-viewer/enc", 32], ["to-viewer/mac", 32]].map(
    ([info, length]) => [info, derive(secret, info, length)],
  ),
);
const tokens = { watch: b64url(keys["token/watch"]), viewer: b64url(keys["token/viewer"]) };
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function seal(direction, message, r, s, ts, iv) {
  const prefix = direction === "toWatch" ? "to-watch" : "to-viewer";
  const cipher = createCipheriv("aes-256-cbc", keys[`${prefix}/enc`], iv);
  const c = Buffer.concat([cipher.update(JSON.stringify(message), "utf8"), cipher.final()]);
  const header = Buffer.alloc(18);
  header[0] = 1;
  header[1] = DIRECTIONS[direction];
  r.copy(header, 2);
  header.writeUInt32BE(s, 10);
  header.writeUInt32BE(ts, 14);
  const t = createHmac("sha256", keys[`${prefix}/mac`]).update(Buffer.concat([header, iv, c])).digest().subarray(0, 16);
  return { v: 1, r: b64(r), s, ts, iv: b64(iv), c: b64(c), t: b64(t) };
}

const viewerRun = Buffer.from("1112131415161718", "hex");
const watchRun = Buffer.from("2122232425262728", "hex");
const ts = 1794873600;
const iv = (n) => Buffer.alloc(16, n);
const envelopes = [
  ["hello", "toWatch", { op: "hello", name: "Pixel 9" }, viewerRun, 1, ts, iv(0xa1)],
  ["show", "toWatch", { op: "show", id: 15 }, viewerRun, 2, ts + 5, iv(0xa2)],
  ["buzz", "toWatch", { op: "buzz", ms: 300 }, viewerRun, 3, ts + 9, iv(0xa3)],
  ["state", "toViewer", { op: "state", id: 15, cycle: false, battery: 87 }, watchRun, 1, ts + 6, iv(0xb1)],
  ["button", "toViewer", { op: "button", key: "menu" }, watchRun, 2, ts + 11, iv(0xb2)],
].map(([name, direction, message, r, s, time, vector]) => ({
  name,
  direction,
  message,
  r: hex(r),
  s,
  ts: time,
  iv: hex(vector),
  envelope: seal(direction, message, r, s, time, vector),
}));

// What a receiver must refuse: each from the "show" envelope, received at its own time
// with nothing seen before, unless said otherwise.
const show = envelopes[1].envelope;
const flip = (text) => {
  const bytes = Buffer.from(text, "base64");
  bytes[0] ^= 1;
  return b64(bytes);
};
const rejected = [
  ["a changed ciphertext", "toWatch", { ...show, c: flip(show.c) }, show.ts, {}, "tag"],
  ["a changed counter", "toWatch", { ...show, s: 7 }, show.ts, {}, "tag"],
  ["another run", "toWatch", { ...show, r: b64(Buffer.from("1112131415161719", "hex")) }, show.ts, {}, "tag"],
  ["reflected back to its sender", "toViewer", show, show.ts, {}, "tag"],
  ["three minutes late", "toWatch", show, show.ts + 180, {}, "clock"],
  ["three minutes early", "toWatch", show, show.ts - 180, {}, "clock"],
  ["seen already", "toWatch", show, show.ts, { [show.r]: 2 }, "replay"],
  ["older than one seen", "toWatch", show, show.ts, { [show.r]: 3 }, "replay"],
  ["version 2", "toWatch", { ...show, v: 2 }, show.ts, {}, "version"],
].map(([name, direction, envelope, now, seen, reason]) => ({ name, direction, envelope, now, seen, reason }));

// The pairing frames for S (viewer/public/js/pairing.js, watch/source/Pairing.mc), worked
// out here again: CRC-16/CCITT-FALSE over the version's byte and S, then the 156 bits
// (version 4, S 128, CRC 16, 8 zero) as 13 frames of an index and three nibbles.
function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit--) {
      const top = ((crc >> 15) & 1) ^ ((byte >> bit) & 1);
      crc = ((crc << 1) & 0xffff) ^ (top ? 0x1021 : 0);
    }
  }
  return crc;
}
const pairingCrc = crc16([1, ...secret]);
const bitString = (1).toString(2).padStart(4, "0") + [...secret].map((b) => b.toString(2).padStart(8, "0")).join("") + pairingCrc.toString(2).padStart(16, "0") + "0".repeat(8);
const frames = Array.from({ length: 13 }, (_, k) => [32 + k, ...[0, 1, 2].map((n) => parseInt(bitString.slice(12 * k + 4 * n, 12 * k + 4 * n + 4), 2))]);

const vectors = {
  comment: "Generated by tools/generate-channel-vectors.mjs; docs/decisions/004-control-channel.md#test-vectors",
  salt: SALT,
  secret: hex(secret),
  derived: {
    id: b64url(keys.id),
    tokens,
    hashes: { watch: sha256(tokens.watch), viewer: sha256(tokens.viewer) },
    keys: Object.fromEntries(["to-watch/enc", "to-watch/mac", "to-viewer/enc", "to-viewer/mac"].map((info) => [info, hex(keys[info])])),
  },
  envelopes,
  rejected,
  pairing: { version: 1, crc: pairingCrc, frames },
};

// The watch's copy: Monkey C can't read the JSON file in a unit test.
const mc = (value) => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(mc).join(", ")}]`;
  return `{ ${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)} => ${mc(item)}`).join(", ")} }`;
};
const watchEnvelopes = envelopes.map(({ name, direction, message, r, s, ts, iv, envelope }) => ({
  name, direction: DIRECTIONS[direction], plain: JSON.stringify(message), keys: Object.keys(message), r, s, ts, iv, envelope,
}));
const watchRejected = rejected.filter(({ direction }) => direction === "toWatch").map(({ name, envelope, now, seen, reason }) => ({ name, envelope, now, seen, reason }));
const watchText = `// Generated by tools/generate-channel-vectors.mjs from the same values as
// protocol/channel-vectors.json. Do not edit; regenerate with:
//   node tools/generate-channel-vectors.mjs
// For the unit tests only (ChannelTest.mc): not in the app's build.
import Toybox.Lang;

(:test)
module ChannelVectors {
    function secret() as String { return ${mc(hex(secret))}; }
    function id() as String { return ${mc(vectors.derived.id)}; }
    function watchToken() as String { return ${mc(tokens.watch)}; }
    function viewerToken() as String { return ${mc(tokens.viewer)}; }
    function watchHash() as String { return ${mc(vectors.derived.hashes.watch)}; }
    function viewerHash() as String { return ${mc(vectors.derived.hashes.viewer)}; }
    function keys() as Dictionary { return ${mc(vectors.derived.keys)}; }
    function envelopes() as Array { return [
${watchEnvelopes.map((v) => `        ${mc(v)},`).join("\n")}
    ]; }
    function rejected() as Array { return [
${watchRejected.map((v) => `        ${mc(v)},`).join("\n")}
    ]; }
    function crc() as Number { return ${pairingCrc}; }
    function frames() as Array { return ${mc(frames)}; }
}
`;

const text = `${JSON.stringify(vectors, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUTPUT, "utf8");
  } catch {
    // Missing: stale.
  }
  let currentWatch = "";
  try {
    currentWatch = readFileSync(WATCH, "utf8");
  } catch {
    // Missing: stale.
  }
  if (current !== text || currentWatch !== watchText) {
    console.error(`generate-channel-vectors: ${OUTPUT} or ${WATCH} is stale: run node tools/generate-channel-vectors.mjs`);
    process.exit(1);
  }
  console.log(`${OUTPUT} and ${WATCH} are up to date`);
} else {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, text);
  writeFileSync(WATCH, watchText);
  console.log(`wrote ${OUTPUT} and ${WATCH}`);
}
