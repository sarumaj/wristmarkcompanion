// The optical handshake (docs/decisions/004-control-channel.md#pairing-the-optical-handshake):
// the watch's secret S in 13 frames of four markers, and the viewer's reading of them.
//
// A round is 156 bits, most significant first: the version (4 bits), S (128 bits), a
// CRC-16/CCITT-FALSE over the version's byte and S's 16 bytes (16 bits), and 8 zero
// bits. Frame k (0 to 12) carries bits 12k to 12k+11 as three markers of 4 bits each
// (IDs 0 to 15): top right, bottom left, bottom right; its top left marker is its index,
// ID 32 + k. The watch shows them in turn; the viewer may read them in any order.

export const VERSION = 1;
export const FRAMES = 13;
export const INDEX_ID = 32;
const BITS = FRAMES * 12;

// CRC-16/CCITT-FALSE: polynomial 0x1021, starting at 0xFFFF, no reflection, no final XOR.
export function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

// The round's bits for S (16 bytes), as an array of 0 and 1.
function roundBits(secret) {
  const crc = crc16([VERSION, ...secret]);
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(VERSION, 4);
  for (const byte of secret) push(byte, 8);
  push(crc, 16);
  while (bits.length < BITS) bits.push(0);
  return bits;
}

// The frames for S: each [index, top right, bottom left, bottom right] marker IDs.
export function encodeFrames(secret) {
  if (secret.length !== 16) throw new Error("S is 16 bytes");
  const bits = roundBits(secret);
  const nibble = (at) => (bits[at] << 3) | (bits[at + 1] << 2) | (bits[at + 2] << 1) | bits[at + 3];
  return Array.from({ length: FRAMES }, (_, k) => [INDEX_ID + k, nibble(12 * k), nibble(12 * k + 4), nibble(12 * k + 8)]);
}

// The round's version and S from the frames' three data nibbles each (in frame order),
// or null when the CRC doesn't match.
export function decodeFrames(nibbles) {
  const bits = nibbles.flat().flatMap((n) => [(n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1]);
  const read = (at, width) => bits.slice(at, at + width).reduce((value, bit) => value * 2 + bit, 0);
  const version = read(0, 4);
  const secret = Uint8Array.from({ length: 16 }, (_, i) => read(4 + 8 * i, 8));
  const crc = read(132, 16);
  return crc === crc16([version, ...secret]) ? { version, secret } : null;
}

const center = (corners) => ({
  x: corners.reduce((sum, c) => sum + c.x, 0) / corners.length,
  y: corners.reduce((sum, c) => sum + c.y, 0) / corners.length,
});

// One frame in a camera image's detected markers ([{id, corners}], corners clockwise from
// the marker's own top left), or null: the index marker and its three data markers placed
// by the index's own axes, so that a frame seen turned or tilted still reads right.
export function readFrame(markers) {
  const index = markers.find((m) => m.id >= INDEX_ID && m.id < INDEX_ID + FRAMES);
  if (!index) return null;
  const [c0, c1, , c3] = index.corners;
  const across = { x: c1.x - c0.x, y: c1.y - c0.y };
  const down = { x: c3.x - c0.x, y: c3.y - c0.y };
  const side2 = across.x * across.x + across.y * across.y;
  if (!side2) return null;
  const origin = center(index.corners);
  const slots = [null, null, null];
  for (const marker of markers) {
    if (marker === index || marker.id > 15) continue;
    const at = center(marker.corners);
    const v = { x: at.x - origin.x, y: at.y - origin.y };
    // In marker sides along the index's own axes: a neighbor is about 1.2 away.
    const right = (v.x * across.x + v.y * across.y) / side2;
    const below = (v.x * down.x + v.y * down.y) / (down.x * down.x + down.y * down.y);
    const isRight = right > 0.6 && right < 1.8;
    const isBelow = below > 0.6 && below < 1.8;
    const isLevel = Math.abs(right) < 0.4;
    const isLevelRow = Math.abs(below) < 0.4;
    if (isRight && isLevelRow) slots[0] = marker.id;
    else if (isLevel && isBelow) slots[1] = marker.id;
    else if (isRight && isBelow) slots[2] = marker.id;
  }
  return slots.includes(null) ? null : { k: index.id - INDEX_ID, nibbles: slots };
}

// Reads a round from frames seen in any order: each frame's readings are counted, and
// the most seen reading of each stands; once all 13 have one, the CRC decides. A wrong
// reading is outvoted as the frame comes round again.
export class FrameReader {
  #votes = Array.from({ length: FRAMES }, () => new Map());

  // A camera image's markers; returns {frames: how many have a reading, secret (once
  // the round checks), version}.
  add(markers) {
    const frame = readFrame(markers);
    if (frame) {
      const key = frame.nibbles.join(",");
      const votes = this.#votes[frame.k];
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    const best = this.#votes.map((votes) => [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]);
    const frames = best.filter(Boolean).length;
    if (frames < FRAMES) return { frames, secret: null };
    const decoded = decodeFrames(best.map((key) => key.split(",").map(Number)));
    return { frames, secret: decoded?.version === VERSION ? decoded.secret : null, version: decoded?.version };
  }

  reset() {
    for (const votes of this.#votes) votes.clear();
  }
}
