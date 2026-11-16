# 003: Pose: coplanar POSIT, assumed intrinsics, flip-aware smoothing

Status: accepted (milestone 2), to be checked against the device tests (milestone 4).

## Camera intrinsics

Browsers don't expose a camera's intrinsics. The viewer assumes a pinhole camera whose horizontal
field of view is 65 degrees, a typical phone main camera, with the principal point at the
image's center. The focal length in pixels is then `width / 2 / tan(fov / 2)`
(`viewer/public/js/tracker.js`, `focalLength`).

- **Effect of a wrong guess:** the distance scales with the focal length, so a camera with 75
  degrees instead of 65 shows about 20 % too far. Orientation is affected much less.
- **Override for tests:** `?fov=<degrees>` on the viewer's URL, and `?size=<mm>` for the marker's
  side (the default, 20 mm, is the watch's; the desktop marker page shows other sizes).
- **Not done:** calibration per phone. If the range tests need exact distances, a calibration
  page with the desktop marker at a measured distance is the next step.

## Pose

js-aruco2's coplanar POSIT (`posit1.js`, Oberkampf, DeMenthon and Davis) takes the marker's four
corners, its side in millimeters and the focal length. It returns the pose with the smaller
reprojection error and the other solution of the planar ambiguity. The translation is in
millimeters.

`smoothing.js` converts POSIT's frame (x right, y up, z away from the camera) to three.js's
camera frame (z toward the viewer) as `S R S` with `S = diag(1, 1, -1)`, which keeps a proper
rotation. The marker's own z axis then points out of its face, toward the camera.

## Flip and jitter

A small planar marker seen at an angle has two poses that fit its corners almost equally well,
mirrored about the line of sight. Frame by frame the better one can switch between them, so the
model flips. The smoother (`PoseSmoother`):

- **Keeps the closer solution:** of the two, the one whose orientation is closest to the current
  smoothed pose, as long as its error is at most twice the better one's plus a pixel.
- **Eases toward each frame:** position by linear interpolation and orientation by spherical
  interpolation, halfway each frame (`alpha` 0.5), which damps the corners' pixel noise.
- **Holds briefly:** the pose stays for 300 ms after the marker is lost, and a detection after
  that starts afresh with POSIT's better solution.

These values are first guesses. The debug overlay (milestone 3) and the device tests (milestone
4) are where they get tuned.

## Verified

`viewer/test/viewer.test.mjs` draws a 120-pixel marker facing a 640-pixel-wide camera model.
The distance comes out within 3 % of `focal length × 20 mm / 120 px`, and the orientation within
3 degrees of facing the camera. The flip handling has no test yet: it needs a sequence of frames
at an angle.
