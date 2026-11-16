// From POSIT's two solutions per frame to one steady pose in three.js's frame.
// A planar marker seen at an angle has two poses that fit its corners almost as
// well, mirrored about the line of sight; frame by frame POSIT's better one can
// jump between them (the flip). The tracker keeps the one closest to the pose it
// already has, and eases position and orientation toward each new frame (jitter).
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

export class PoseSmoother {
  // alpha: how far each frame moves the pose toward the new one (1: no smoothing).
  // holdMs: how long the pose stays after the marker is lost, and after which a new
  // detection starts afresh. flipTolerance: the other solution is taken while its
  // error is at most this many times the better one's.
  constructor({ alpha = 0.5, holdMs = 300, flipTolerance = 2 } = {}) {
    this.alpha = alpha;
    this.holdMs = holdMs;
    this.flipTolerance = flipTolerance;
    this.current = null;
    this.lastSeen = -Infinity;
  }

  // A frame's pose (MarkerTracker.pose) at time `now` (ms): the smoothed pose.
  update(pose, now) {
    const candidates = [pose.best, pose.alternative]
      .filter((solution) => solution && solution.error <= this.flipTolerance * pose.best.error + 1)
      .map(toThree);
    const fresh = !this.current || now - this.lastSeen > this.holdMs;
    this.lastSeen = now;
    if (fresh) {
      this.current = candidates[0];
      return this.current;
    }
    const closest = candidates.reduce((a, b) =>
      this.current.quaternion.angleTo(a.quaternion) <= this.current.quaternion.angleTo(b.quaternion) ? a : b,
    );
    this.current.position.lerp(closest.position, this.alpha);
    this.current.quaternion.slerp(closest.quaternion, this.alpha);
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
