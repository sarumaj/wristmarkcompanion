// The viewer's end of the control channel (docs/dev/decisions/004-control-channel.md): pairing
// with the watch through the camera (js/pairing.js), the session it gives (js/channel.js),
// kept in IndexedDB, and the relay: the channel created with the tokens' hashes, commands
// sent toward the watch, the watch's events read from an event stream with fetch (only
// fetch can send the token), resumed after a drop with Last-Event-ID.
import { deriveSession, open, seal } from "./channel.js";
import { FrameReader } from "./pairing.js";

const DB = "wristmark";
const STORE = "sessions";
// A session ends 7 days after its last use or 30 days after its pairing.
const UNUSED_MS = 7 * 86400000;
const AGE_MS = 30 * 86400000;
// After a dropped stream, the next try.
const RETRY_MS = 2000;
// Waiting this long for the watch's answer, the viewer says the watch may have forgotten it.
const UNANSWERED_MS = 20000;
// What the viewer says when the watch ended the pairing (the relay's 410).
const ENDED = "The watch ended this pairing: pair again to steer it.";

// IndexedDB, as promises: the sessions with their keys as CryptoKeys, which the store
// keeps without their bytes ever reaching the page's script.
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(mode, work) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

// The name the watch lists this viewer by: the browser and the system, roughly.
export function viewerName(agent = navigator.userAgent) {
  const system = /iPhone|iPad/.test(agent) ? "iPhone" : /Android/.test(agent) ? "Android" : /Mac/.test(agent) ? "Mac" : /Windows/.test(agent) ? "Windows" : "Linux";
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  return `${browser} on ${system}`;
}

export class Remote {
  // `onChange(remote)` after any change of state; `onEvent(message)` for each message
  // from the watch.
  constructor({ base = "relay/v1", onChange = () => {}, onEvent = () => {} } = {}) {
    this.base = base;
    this.onChange = onChange;
    this.onEvent = onEvent;
    // idle, pairing, connecting, waiting, connected, reconnecting (the stream dropped),
    // failed.
    this.state = "idle";
    // Waiting long enough for the watch to say it may have forgotten this viewer.
    this.unanswered = false;
    // Said once in idle: why the pairing is gone.
    this.notice = "";
    this.frames = 0;
    this.error = "";
    this.watch = null;
    this.session = null;
    this.reader = new FrameReader();
    this.run = crypto.getRandomValues(new Uint8Array(8));
    this.sent = 0;
    this.seen = new Map();
    this.stream = null;
  }

  set(state, fields = {}) {
    Object.assign(this, { state }, fields);
    this.onChange(this);
  }

  // The session kept from an earlier visit, if any and not expired: connected again.
  async restore() {
    let sessions;
    try {
      sessions = (await store("readonly", (s) => s.getAll())) ?? [];
    } catch {
      // No IndexedDB (a private window may have none): nothing kept.
      return;
    }
    const now = Date.now();
    for (const session of sessions) {
      if (now - session.usedAt > UNUSED_MS || now - session.pairedAt > AGE_MS) {
        await store("readwrite", (s) => s.delete(session.id)).catch(() => {});
      }
    }
    const live = sessions.filter((s) => now - s.usedAt <= UNUSED_MS && now - s.pairedAt <= AGE_MS).sort((a, b) => b.usedAt - a.usedAt);
    if (live.length) await this.connect(live[0], { greet: true });
  }

  startPairing() {
    this.reader.reset();
    this.set("pairing", { frames: 0, error: "", notice: "" });
  }

  // Back to what was before pairing: the session kept, if any.
  cancel() {
    if (this.state === "pairing") this.set(this.session ? (this.watch ? "connected" : "waiting") : "idle");
  }

  // A camera image's markers while pairing: the frames read so far; once the round
  // checks, the session from its secret.
  read(markers) {
    if (this.state !== "pairing") return;
    const { frames, secret } = this.reader.add(markers);
    if (frames !== this.frames) this.set("pairing", { frames });
    if (secret) this.pair(secret);
  }

  async pair(secret) {
    this.set("connecting");
    try {
      const derived = await deriveSession(secret);
      const now = Date.now();
      // Pending until the watch answers the hello: kept only then (`received`), so that a
      // pairing the watch never confirmed isn't connected to again after a reload.
      const session = { id: derived.id, tokens: derived.tokens, hashes: derived.hashes, keys: derived.keys, pairedAt: now, usedAt: now, lastEvent: 0, pending: true };
      this.watch = null;
      await this.connect(session, { greet: true });
    } catch (error) {
      this.set("failed", { error: error.message });
    }
  }

  async request(method, path, { token, body, signal } = {}) {
    const response = await fetch(`${this.base}${path}`, {
      method,
      signal,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw Object.assign(new Error(problem.detail ?? `the relay answered ${response.status}`), { status: response.status });
    }
    return response;
  }

  // The channel created (again: the same hashes are harmless), the stream opened, and a
  // hello sent: the watch confirms the pairing with it, or answers with its state.
  async connect(session, { greet }) {
    this.session = session;
    clearTimeout(this.unansweredTimer);
    this.set("connecting", { unanswered: false });
    try {
      await this.request("PUT", `/channels/${session.id}`, { body: session.hashes });
    } catch (error) {
      if (error.status === 410) await this.forget(ENDED);
      else this.set("failed", { error: `The relay can't be reached: ${error.message}` });
      return;
    }
    this.listen();
    if (greet) {
      try {
        await this.send({ op: "hello", name: viewerName() });
      } catch (error) {
        // Ended (410): `send` has forgotten the session already.
        if (this.session === session) this.set("failed", { error: `The relay can't be reached: ${error.message}` });
        return;
      }
    }
    if (this.session !== session) return;
    this.set(this.watch ? "connected" : "waiting");
    // No answer for a while: the watch's app may be closed, or the watch may have forgotten
    // this viewer (its menu, or a reinstall) while the relay couldn't tell.
    this.unansweredTimer = setTimeout(() => {
      if (this.session === session && this.state === "waiting") this.set("waiting", { unanswered: true });
    }, UNANSWERED_MS);
  }

  async send(message) {
    if (!this.session) return;
    const session = this.session;
    const envelope = await seal(session.keys.toWatch, "toWatch", message, { r: this.run, s: ++this.sent, ts: Math.floor(Date.now() / 1000) });
    try {
      await this.request("POST", `/channels/${session.id}/to-watch`, { token: session.tokens.viewer, body: envelope });
    } catch (error) {
      if (error.status === 410 && this.session === session) await this.forget(ENDED);
      throw error;
    }
    this.touch();
  }

  // Used just now; kept in IndexedDB once the watch has confirmed it.
  touch() {
    if (!this.session) return;
    this.session.usedAt = Date.now();
    const session = this.session;
    if (!session.pending) store("readwrite", (s) => s.put(session)).catch(() => {});
  }

  // The watch answered a new pairing: kept, and the sessions from before ended, since the
  // viewer steers one watch at a time (a pairing again with the same watch leaves no stale
  // entry in its menu).
  async confirm(session) {
    delete session.pending;
    await store("readwrite", (s) => s.put(session)).catch(() => {});
    let others;
    try {
      others = ((await store("readonly", (s) => s.getAll())) ?? []).filter((other) => other.id !== session.id);
    } catch {
      return;
    }
    for (const other of others) {
      await this.end(other);
      await store("readwrite", (s) => s.delete(other.id)).catch(() => {});
    }
  }

  // Tells the watch (bye), then deletes the channel; the relay keeps its tombstone, so the
  // watch learns it also when its app opens days later. Best effort: the watch's menu forgets
  // a viewer too.
  async end(session) {
    try {
      const envelope = await seal(session.keys.toWatch, "toWatch", { op: "bye" }, { r: this.run, s: ++this.sent, ts: Math.floor(Date.now() / 1000) });
      await this.request("POST", `/channels/${session.id}/to-watch`, { token: session.tokens.viewer, body: envelope });
    } catch {
      // Gone already, or the relay unreachable: the delete may still work.
    }
    await this.request("DELETE", `/channels/${session.id}`, { token: session.tokens.viewer }).catch(() => {});
  }

  // The watch's events: read from the stream as they come; after a drop, again from the
  // last one read.
  listen() {
    this.stream?.abort();
    const controller = new AbortController();
    this.stream = controller;
    const session = this.session;
    // After a drop, the hello again: the watch answers with its state, which says it's there.
    let dropped = false;
    const loop = async () => {
      while (!controller.signal.aborted && this.session === session) {
        try {
          const response = await fetch(`${this.base}/channels/${session.id}/to-viewer`, {
            signal: controller.signal,
            headers: { Accept: "text/event-stream", Authorization: `Bearer ${session.tokens.viewer}`, ...(session.lastEvent ? { "Last-Event-ID": String(session.lastEvent) } : {}) },
          });
          if (response.status === 404) {
            // The relay forgot the channel: create it again, its queue numbered from 1 again,
            // then read on.
            await this.request("PUT", `/channels/${session.id}`, { body: session.hashes });
            session.lastEvent = 0;
            continue;
          }
          if (response.status === 410) {
            // The watch ended the pairing.
            if (this.session === session) await this.forget(ENDED);
            return;
          }
          if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);
          if (dropped) {
            dropped = false;
            this.send({ op: "hello", name: viewerName() }).catch(() => {});
          }
          await this.events(response.body, session, controller.signal);
        } catch {
          if (controller.signal.aborted) return;
          // The relay can't be reached: the watch's state shown is no longer current.
          dropped = true;
          if (this.session === session && this.state === "connected") this.set("reconnecting");
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    };
    loop();
  }

  // Server-sent events from a byte stream: each event's id and data lines, to a blank line.
  async events(body, session, signal) {
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let id = null;
    let data = "";
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (line.startsWith("id:")) id = line.slice(3).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
        else if (line === "" && data) {
          await this.received(session, data, Number(id));
          data = "";
          id = null;
        }
      }
    }
  }

  async received(session, data, id) {
    if (id) session.lastEvent = id;
    let message;
    try {
      message = await open(session.keys.toViewer, "toViewer", JSON.parse(data), { now: Math.floor(Date.now() / 1000), seen: this.seen });
    } catch {
      // Not from the watch, or replayed: dropped.
      return;
    }
    if (this.session !== session) return;
    if (session.pending) await this.confirm(session);
    this.touch();
    if (message.op === "state") {
      clearTimeout(this.unansweredTimer);
      const watch = { id: message.id, cycle: message.cycle, battery: message.battery };
      // While pairing another watch, the state is noted, the pairing left on screen.
      if (this.state === "pairing") this.watch = watch;
      else this.set("connected", { unanswered: false, watch });
    } else if (message.op === "bye") {
      await this.forget(ENDED);
      return;
    }
    this.onEvent(message);
  }

  // Unpaired here: the watch is told, the channel and the session are gone. Also from
  // waiting, for a watch that forgot this viewer.
  async disconnect() {
    const session = this.session;
    if (!session) return;
    this.stream?.abort();
    await this.end(session);
    if (this.session === session) await this.forget();
  }

  // The session gone from here; `notice` says why, in idle.
  async forget(notice = "") {
    const session = this.session;
    this.stream?.abort();
    clearTimeout(this.unansweredTimer);
    this.session = null;
    this.watch = null;
    if (session) await store("readwrite", (s) => s.delete(session.id)).catch(() => {});
    this.set("idle", { notice, unanswered: false });
  }
}
