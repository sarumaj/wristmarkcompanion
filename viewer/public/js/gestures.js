// Gestures of the wrist, from the smoothed pose of the watch (docs/dev/interaction.md):
// a flick (a quick turn of the watch), a twist (a turn about its own axis), a shake
// (a quick back and forth) and a hold (still for a moment after moving). Plain numbers
// in and out, so that Node's tests run it on made-up movements.
//
// A frame: {t (ms), tracked, position [x, y, z] (mm, the camera's frame: x right, y up,
// z toward the viewer), quaternion [x, y, z, w] (the marker's orientation, its z out
// of the watch)}.
//
// The thresholds are first guesses; the device tests' pose data will tune them.

export const FLICK_DEGREES_PER_SECOND = 220;
export const TWIST_DEGREES = 35;
export const TWIST_WITHIN_MS = 400;
export const SHAKE_REVERSALS = 3;
export const SHAKE_WITHIN_MS = 800;
export const SHAKE_MM_PER_SECOND = 80;
export const HOLD_MS = 700;
export const STILL_DEGREES_PER_SECOND = 20;
export const STILL_MM_PER_SECOND = 30;
// After a gesture, the same one isn't recognized again for this long.
export const REFRACTORY_MS = 600;
// A jump of the face by more than this in one frame is the planar flip, not a movement;
// so is one by more than SUDDEN_DEGREES straight out of stillness (below STILL_STEP).
export const FLIP_DEGREES = 45;
export const SUDDEN_DEGREES = 20;
export const STILL_STEP_DEGREES = 4;
// The turn's speed is measured over at least this long, not frame to frame: the pose's
// jitter, divided by one frame's time, would look like a turn.
export const SPEED_WINDOW_MS = 60;
// A marker lost within this long after turning at least LOST_FLICK_SHARE of a flick's
// speed was turned away in a flick (a quick turn blurs it, or turns it edge on).
export const LOST_FLICK_MS = 150;
export const LOST_FLICK_SHARE = 0.6;
// A gap in tracking longer than this starts afresh.
export const GAP_MS = 250;

const DEG = 180 / Math.PI;

// v rotated by the unit quaternion q.
export function rotate([x, y, z, w], [vx, vy, vz]) {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

function angle(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, Math.max(-1, dot))) * DEG;
}

// The difference of two angles in degrees, in -180 to 180.
const wrap = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;

export class GestureRecognizer {
  constructor() {
    this.history = [];
    this.last = {};
    this.moved = false;
    this.stillSince = null;
    // The watch's turn about its own axis, unwrapped (degrees): what a model may follow.
    this.roll = 0;
  }

  reset() {
    this.history = [];
    this.turning = null;
    this.moved = false;
    this.stillSince = null;
  }

  fire(name, t, detail = {}) {
    if (t - (this.last[name] ?? -Infinity) < REFRACTORY_MS) return null;
    this.last[name] = t;
    return { name, t, ...detail };
  }

  // A frame in; the gestures it completes out (an array, usually empty).
  update(frame) {
    if (!frame.tracked) {
      const events = [];
      // Lost just after a quick turn: the turn was a flick.
      if (this.turning && frame.t - this.turning.t <= LOST_FLICK_MS) {
        events.push(this.fire("flick", frame.t, { direction: this.turning.direction }));
        this.turning = null;
      }
      if (this.history.length && frame.t - this.history.at(-1).t > GAP_MS) this.reset();
      return events.filter(Boolean);
    }
    const normal = rotate(frame.quaternion, [0, 0, 1]);
    const xAxis = rotate(frame.quaternion, [1, 0, 0]);
    const rollAngle = Math.atan2(xAxis[1], xAxis[0]) * DEG;
    const previous = this.history.at(-1);
    if (previous) {
      const step = angle(previous.normal, normal);
      const sudden = step > SUDDEN_DEGREES && (previous.step ?? 0) < STILL_STEP_DEGREES;
      if (frame.t - previous.t > GAP_MS || step > FLIP_DEGREES || sudden) this.reset();
    }
    const before = this.history.at(-1);
    if (before) this.roll += wrap(rollAngle - before.rollAngle);
    const sample = { t: frame.t, position: frame.position, normal, rollAngle, roll: this.roll, step: before ? angle(before.normal, normal) : 0 };
    this.history.push(sample);
    while (this.history.length && this.history[0].t < frame.t - 1000) this.history.shift();
    if (!before) return [];

    const events = [];
    const dt = Math.max(1, frame.t - before.t) / 1000;
    // The turn since the last sample at least SPEED_WINDOW_MS old (or the oldest).
    const from = this.history.findLast((s) => s.t <= frame.t - SPEED_WINDOW_MS) ?? this.history[0];
    const turnSpeed = from === sample ? 0 : angle(from.normal, normal) / (Math.max(1, frame.t - from.t) / 1000);
    const velocity = frame.position.map((value, axis) => (value - before.position[axis]) / dt);
    const speed = Math.hypot(...velocity);
    sample.vx = velocity[0];

    // Which way the face turned, in the image: its change across the screen.
    const direction = [normal[0] - from.normal[0], normal[1] - from.normal[1]];
    if (turnSpeed > FLICK_DEGREES_PER_SECOND) {
      events.push(this.fire("flick", frame.t, { direction }));
      this.turning = null;
    } else {
      this.turning = turnSpeed > LOST_FLICK_SHARE * FLICK_DEGREES_PER_SECOND ? { t: frame.t, direction } : null;
    }

    const twistFrom = this.history.find((s) => s.t >= frame.t - TWIST_WITHIN_MS);
    const twist = this.roll - twistFrom.roll;
    if (Math.abs(twist) > TWIST_DEGREES) {
      const event = this.fire("twist", frame.t, { degrees: twist, direction: Math.sign(twist) });
      if (event) {
        events.push(event);
        // The next twist counts from here.
        for (const s of this.history) s.roll = this.roll;
      }
    }

    // A shake: the sideways velocity reversing, fast both ways, several times.
    const recent = this.history.filter((s) => s.t >= frame.t - SHAKE_WITHIN_MS && Math.abs(s.vx ?? 0) > SHAKE_MM_PER_SECOND);
    let reversals = 0;
    for (let i = 1; i < recent.length; i++) {
      if (Math.sign(recent[i].vx) !== Math.sign(recent[i - 1].vx)) reversals++;
    }
    if (reversals >= SHAKE_REVERSALS) {
      events.push(this.fire("shake", frame.t));
    }

    // A hold: still for HOLD_MS after having moved.
    const still = turnSpeed < STILL_DEGREES_PER_SECOND && speed < STILL_MM_PER_SECOND;
    if (!still) {
      this.moved = true;
      this.stillSince = null;
    } else {
      this.stillSince ??= frame.t;
      if (this.moved && frame.t - this.stillSince >= HOLD_MS) {
        this.moved = false;
        events.push(this.fire("hold", frame.t));
      }
    }
    return events.filter(Boolean);
  }
}
