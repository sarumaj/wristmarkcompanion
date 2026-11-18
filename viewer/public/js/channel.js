// The control channel's cryptography in the viewer (docs/dev/decisions/004-control-channel.md):
// the keys derived from the watch's secret S with HKDF-SHA256, and the envelopes,
// AES-256-CBC then HMAC-SHA256 (encrypt-then-MAC), with WebCrypto. The watch does the
// same with Toybox.Cryptography; protocol/channel-vectors.json holds outputs both must
// match byte for byte (made by tools/generate-channel-vectors.mjs with Node's crypto, an
// implementation of its own).
//
// The bytes the tag covers, in this order:
//   version (1 byte) | direction (1 byte: 1 toward the watch, 2 toward the viewer)
//   | r (8 bytes) | s (4 bytes, big-endian) | ts (4 bytes, big-endian) | iv (16) | c
// and the tag is the HMAC's first 16 bytes. 32-bit fields because the watch's
// ByteArray.encodeNumber writes no wider; ts as an unsigned count of seconds lasts to 2106.

export const VERSION = 1;
export const SALT = "wristmark/channel/v1";
export const DIRECTIONS = { toWatch: 1, toViewer: 2 };
// How far an envelope's clock may be from ours, in seconds.
export const SKEW = 120;

const subtle = globalThis.crypto.subtle;
const utf8 = new TextEncoder();

export function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

// Unpadded base64url: the channel's ID and the tokens, which travel in paths and headers.
export function toBase64Url(bytes) {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// HKDF-SHA256 of the secret, `length` bytes for `info`.
async function hkdf(secret, info, length) {
  const key = await subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: utf8.encode(SALT), info: utf8.encode(info) }, key, length * 8);
  return new Uint8Array(bits);
}

// Everything a session needs from S (16 bytes): the channel's ID, both tokens and the
// SHA-256 of each (hex, for the relay's PUT), and the four keys as CryptoKeys. With
// `extractable` false (the default) the page's own script can't read the keys' bytes;
// the tests ask for them.
export async function deriveSession(secret, { extractable = false } = {}) {
  if (secret.length !== 16) throw new Error("S is 16 bytes");
  const [id, watchToken, viewerToken, toWatchEnc, toWatchMac, toViewerEnc, toViewerMac] = await Promise.all([
    hkdf(secret, "id", 16),
    hkdf(secret, "token/watch", 32),
    hkdf(secret, "token/viewer", 32),
    hkdf(secret, "to-watch/enc", 32),
    hkdf(secret, "to-watch/mac", 32),
    hkdf(secret, "to-viewer/enc", 32),
    hkdf(secret, "to-viewer/mac", 32),
  ]);
  const aes = (raw) => subtle.importKey("raw", raw, { name: "AES-CBC" }, extractable, ["encrypt", "decrypt"]);
  const hmac = (raw) => subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, extractable, ["sign"]);
  const tokens = { watch: toBase64Url(watchToken), viewer: toBase64Url(viewerToken) };
  const hash = async (token) => toHex(new Uint8Array(await subtle.digest("SHA-256", utf8.encode(token))));
  return {
    id: toBase64Url(id),
    tokens,
    hashes: { watch: await hash(tokens.watch), viewer: await hash(tokens.viewer) },
    keys: {
      toWatch: { enc: await aes(toWatchEnc), mac: await hmac(toWatchMac) },
      toViewer: { enc: await aes(toViewerEnc), mac: await hmac(toViewerMac) },
    },
  };
}

function authenticated(direction, r, s, ts, iv, c) {
  const bytes = new Uint8Array(2 + 8 + 4 + 4 + 16 + c.length);
  const view = new DataView(bytes.buffer);
  bytes[0] = VERSION;
  bytes[1] = DIRECTIONS[direction];
  bytes.set(r, 2);
  view.setUint32(10, s);
  view.setUint32(14, ts);
  bytes.set(iv, 18);
  bytes.set(c, 34);
  return bytes;
}

async function tag(macKey, bytes) {
  return new Uint8Array(await subtle.sign("HMAC", macKey, bytes)).slice(0, 16);
}

// An envelope of `message` (an object, as JSON) in `direction` ("toWatch", "toViewer")
// with that direction's keys, from run `r` (8 bytes), number `s`, at `ts` (Unix
// seconds). `iv` is random unless given (the test vectors give it).
export async function seal(keys, direction, message, { r, s, ts, iv = globalThis.crypto.getRandomValues(new Uint8Array(16)) }) {
  const plain = utf8.encode(JSON.stringify(message));
  const c = new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv }, keys.enc, plain));
  const t = await tag(keys.mac, authenticated(direction, r, s, ts, iv, c));
  return { v: VERSION, r: toBase64(r), s, ts, iv: toBase64(iv), c: toBase64(c), t: toBase64(t) };
}

// Equal in time that doesn't depend on where they differ.
function same(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

// The message in an envelope received in `direction`, after the checks, in this order:
// the version, the tag (before decrypting), the clock (`now`, Unix seconds, within
// SKEW), and that `s` is above the last accepted from its run (`seen`, a Map of run to
// s, which this updates). Throws with the reason otherwise.
export async function open(keys, direction, envelope, { now, seen }) {
  if (envelope?.v !== VERSION) throw new Error("not a version 1 envelope");
  const { s, ts } = envelope;
  if (!Number.isInteger(s) || s < 1 || s > 0xffffffff || !Number.isInteger(ts) || ts < 0 || ts > 0xffffffff) {
    throw new Error("s or ts out of range");
  }
  const [r, iv, c, t] = [envelope.r, envelope.iv, envelope.c, envelope.t].map(fromBase64);
  if (r.length !== 8 || iv.length !== 16 || t.length !== 16 || c.length === 0 || c.length % 16) {
    throw new Error("a field has the wrong length");
  }
  if (!same(await tag(keys.mac, authenticated(direction, r, s, ts, iv, c)), t)) throw new Error("the tag doesn't verify");
  if (Math.abs(ts - now) > SKEW) throw new Error("the clock is too far off");
  // The run as its canonical base64, from its bytes: another spelling of the same bytes
  // (no padding, other unused bits) must not count as a new run.
  const run = toBase64(r);
  if (s <= (seen.get(run) ?? 0)) throw new Error("replayed or out of order");
  const plain = await subtle.decrypt({ name: "AES-CBC", iv }, keys.enc, c);
  seen.set(run, s);
  return JSON.parse(new TextDecoder().decode(plain));
}
