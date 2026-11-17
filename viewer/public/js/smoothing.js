// From POSIT's two solutions per frame to one steady pose in three.js's frame.
// A planar marker seen at an angle has two poses that fit its corners almost as
// well, mirrored about the line of sight; frame by frame POSIT's better one can
// jump between them (the flip). The tracker keeps the one closest to the pose it
// already has, and filters position and orientation (jitter) without holding back a
// quick turn.
import { Matrix4, Quaternion, Vector3 } from "../vendor/three/three.module.js";

// POSIT's frame (x right, y up, z away from the camera) to three.js's camera frame
// (z toward the viewer): S R S with S = diag(1, 1, -1) keeps a proper rotation, and
// the marker's own z axis points out of its face, toward the camera.
export function toThree({ rotation: r, translation: t }) {
  const matrix = new Matrix4().set(
    r[0][0], r[0][1], -r[0][2], t[0],
    r[1][0], r[1][1], -r[1][2], t[1],
    -r[2][0], -r[2][1], r[2][2], -t[2],
    0, 0, 0, 1,
  );
  const position = new Vector3();
  const quaternion = new Quaternion();
  matrix.decompose(position, quaternion, new Vector3());
  return { position, quaternion };
}

// The One Euro filter's smoothing factor for a cutoff frequency (Hz) over dt (s).
const factor = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

// Steady when still, quick when moving: the One Euro filter (Casiez, Roussel and Vogel,
// CHI 2012) on the position and the orientation. Its cutoff frequency grows with the
// speed: a still watch's jitter is smoothed away (a cutoff of `minCutoff` Hz), a turn
// of the wrist comes through nearly without lag (`beta` more Hz per degree, or
// millimeter, a second). docs/decisions/003-pose.md#stability.
export class PoseSmoother {
  // holdMs: how long the pose stays after the marker is lost, and after which a new
  // detection starts afresh. flipTolerance: the other solution is taken while its
  // error is at most this many times the better one's (plus a pixel). jumpDegrees: a
  // turn larger than this in one frame waits for the next frame to confirm it (the
  // planar flip, when only the wrong solution is found, lasts one frame).
  constructor({
    minCutoff = 1.5,
    turnBeta = 0.03,
    moveBeta = 0.02,
    speedCutoff = 1,
    holdMs = 300,
    flipTolerance = 2,
    jumpDegrees = 45,
  } = {}) {
    Object.assign(this, { minCutoff, turnBeta, moveBeta, speedCutoff, holdMs, flipTolerance, jumpDegrees });
    this.current = null;
    this.lastSeen = -Infinity;
    this.pending = null;
    // Degrees and millimeters a second, smoothed: how fast the watch turns and moves.
    this.turnSpeed = 0;
    this.moveSpeed = 0;
  }

  // A frame's pose (MarkerTracker.pose) at time `now` (ms): the smoothed pose.
  update(pose, now) {
    const candidates = [pose.best, pose.alternative]
      .filter((solution) => solution && solution.error <= this.flipTolerance * pose.best.error + 1)
      .map(toThree);
    const fresh = !this.current || now - this.lastSeen > this.holdMs;
    const dt = Math.max(1, now - this.lastSeen) / 1000;
    this.lastSeen = now;
    if (fresh) {
      this.current = candidates[0];
      this.pending = null;
      this.turnSpeed = 0;
      this.moveSpeed = 0;
      return this.current;
    }
    const closest = candidates.reduce((a, b) =>
      this.current.quaternion.angleTo(a.quaternion) <= this.current.quaternion.angleTo(b.quaternion) ? a : b,
    );
    const turn = (this.current.quaternion.angleTo(closest.quaternion) * 180) / Math.PI;
    if (turn > this.jumpDegrees) {
      // A jump: taken only when the next frame agrees with it, then without smoothing.
      const confirmed = this.pending && (this.pending.quaternion.angleTo(closest.quaternion) * 180) / Math.PI < this.jumpDegrees / 2;
      this.pending = closest;
      if (!confirmed) return this.current;
      this.current = closest;
      this.pending = null;
      return this.current;
    }
    this.pending = null;
    const move = this.current.position.distanceTo(closest.position);
    this.turnSpeed += factor(this.speedCutoff, dt) * (turn / dt - this.turnSpeed);
    this.moveSpeed += factor(this.speedCutoff, dt) * (move / dt - this.moveSpeed);
    this.current.quaternion.slerp(closest.quaternion, factor(this.minCutoff + this.turnBeta * this.turnSpeed, dt));
    this.current.position.lerp(closest.position, factor(this.minCutoff + this.moveBeta * this.moveSpeed, dt));
    return this.current;
  }

  // A frame without the marker: the last pose while it is held, else null.
  lost(now) {
    if (this.current && now - this.lastSeen > this.holdMs) {
      this.current = null;
    }
    return this.current;
  }
}
