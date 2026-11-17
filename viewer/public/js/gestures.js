// Gestures of the wrist, from the smoothed pose of the watch (docs/interaction.md):
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
// A jump of the face by more than this in one frame is the planar flip, not a movement.
export const FLIP_DEGREES = 30;
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
      if (this.history.length && frame.t - this.history.at(-1).t > GAP_MS) this.reset();
      return [];
    }
    const normal = rotate(frame.quaternion, [0, 0, 1]);
    const xAxis = rotate(frame.quaternion, [1, 0, 0]);
    const rollAngle = Math.atan2(xAxis[1], xAxis[0]) * DEG;
    const previous = this.history.at(-1);
    if (previous && (frame.t - previous.t > GAP_MS || angle(previous.normal, normal) > FLIP_DEGREES)) {
      this.reset();
    }
    const before = this.history.at(-1);
    if (before) this.roll += wrap(rollAngle - before.rollAngle);
    const sample = { t: frame.t, position: frame.position, normal, rollAngle, roll: this.roll };
    this.history.push(sample);
    while (this.history.length && this.history[0].t < frame.t - 1000) this.history.shift();
    if (!before) return [];

    const events = [];
    const dt = Math.max(1, frame.t - before.t) / 1000;
    const turnSpeed = angle(before.normal, normal) / dt;
    const velocity = frame.position.map((value, axis) => (value - before.position[axis]) / dt);
    const speed = Math.hypot(...velocity);
    sample.vx = velocity[0];

    if (turnSpeed > FLICK_DEGREES_PER_SECOND) {
      // Which way the face turned, in the image: its change across the screen.
      const direction = [normal[0] - before.normal[0], normal[1] - before.normal[1]];
      events.push(this.fire("flick", frame.t, { direction }));
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
