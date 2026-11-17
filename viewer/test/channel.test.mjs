// The control channel's cryptography in the viewer (public/js/channel.js), with WebCrypto,
// against protocol/channel-vectors.json, made with Node's crypto: the same keys, the same
// envelopes byte for byte, each opened again, and every envelope a receiver must refuse
// refused for its reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deriveSession, open, seal, toHex } from "../public/js/channel.js";

const vectors = JSON.parse(await readFile(new URL("../../protocol/channel-vectors.json", import.meta.url), "utf8"));
const bytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
const session = await deriveSession(bytes(vectors.secret), { extractable: true });
const keysOf = (direction) => session.keys[direction];

test("the session's ID, tokens, hashes and keys are the vectors'", async () => {
  assert.equal(session.id, vectors.derived.id);
  assert.deepEqual(session.tokens, vectors.derived.tokens);
  assert.deepEqual(session.hashes, vectors.derived.hashes);
  const raw = async (key) => toHex(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
  assert.deepEqual(
    {
      "to-watch/enc": await raw(session.keys.toWatch.enc),
      "to-watch/mac": await raw(session.keys.toWatch.mac),
      "to-viewer/enc": await raw(session.keys.toViewer.enc),
      "to-viewer/mac": await raw(session.keys.toViewer.mac),
    },
    vectors.derived.keys,
  );
});

test("the keys can't be read where the page keeps them", async () => {
  const kept = await deriveSession(bytes(vectors.secret));
  await assert.rejects(crypto.subtle.exportKey("raw", kept.keys.toWatch.enc));
});

test("each envelope is sealed byte for byte as the vectors, and opens to its message", async () => {
  for (const { name, direction, message, r, s, ts, iv, envelope } of vectors.envelopes) {
    const sealed = await seal(keysOf(direction), direction, message, { r: bytes(r), s, ts, iv: bytes(iv) });
    assert.deepEqual(sealed, envelope, name);
    assert.deepEqual(await open(keysOf(direction), direction, envelope, { now: ts, seen: new Map() }), message, name);
  }
});

test("a run's envelopes open in order, and the counter is kept per run", async () => {
  const seen = new Map();
  for (const { direction, message, ts, envelope } of vectors.envelopes.filter((v) => v.direction === "toWatch")) {
    assert.deepEqual(await open(keysOf(direction), direction, envelope, { now: ts, seen }), message);
  }
  assert.equal(seen.get(vectors.envelopes[0].envelope.r), 3);
});

const REASONS = { tag: /tag/, clock: /clock/, replay: /replayed/, version: /version/ };

test("every envelope a receiver must refuse is refused, for its reason", async () => {
  for (const { name, direction, envelope, now, seen, reason } of vectors.rejected) {
    await assert.rejects(open(keysOf(direction), direction, envelope, { now, seen: new Map(Object.entries(seen)) }), REASONS[reason], name);
  }
});

test("random IVs: the same message twice is two different envelopes", async () => {
  const options = { r: bytes("0102030405060708"), s: 1, ts: 1 };
  const [a, b] = await Promise.all([1, 2].map(() => seal(keysOf("toWatch"), "toWatch", { op: "bye" }, options)));
  assert.notEqual(a.c, b.c);
  assert.notEqual(a.iv, b.iv);
});
