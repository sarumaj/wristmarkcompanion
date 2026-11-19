# 003: Pose: coplanar POSIT, refined; assumed intrinsics; flip-aware smoothing

Status: accepted (milestone 2), to be checked against the device tests (milestone 4).

## Camera intrinsics

Browsers don't expose a camera's intrinsics. The viewer assumes a pinhole camera whose field of
view across the sensor's longer side is 65 degrees, a typical phone main camera, with the
principal point at the image's center. The focal length in pixels is then
`max(width, height) / 2 / tan(fov / 2)` (`viewer/public/js/tracker.js`, `focalLength`): a phone
held upright delivers its frames turned (720 wide, 1280 high), and the width alone would make
every distance read about 44 % short.

- **Effect of a wrong guess:** the distance scales with the focal length, so a camera with 75
  degrees instead of 65 shows about 20 % too far. Orientation is affected much less.
- **Override for tests:** `?fov=<degrees>` on the viewer's URL, and `?size=<mm>` for the marker's
  side (the default, 20 mm, is the watch's; the desktop marker page shows other sizes).
- **Not done:** calibration per phone. If the range tests need exact distances, a calibration
  page with the desktop marker at a measured distance is the next step.

## Pose

js-aruco2's coplanar POSIT (`posit1.js`, Oberkampf, DeMenthon and Davis) takes the marker's four
corners, its side in millimeters and the focal length. It returns two poses, the planar
ambiguity's two solutions, approximately. Each is then refined (`pose-refine.js`): a few
Levenberg-Marquardt steps that minimize the distance in pixels between the corners seen and the
ones the pose projects. The better fit is the best solution, the other the alternative. The
translation is in millimeters. A pixel's center is at its index plus half a pixel.

`smoothing.js` converts POSIT's frame (x right, y up, z away from the camera) to three.js's
camera frame (z toward the viewer) as `S R S` with `S = diag(1, 1, -1)`, which keeps a proper
rotation. The marker's own z axis then points out of its face, toward the camera.

## Flip and jitter

A small planar marker seen at an angle has two poses that fit its corners almost equally well,
mirrored about the line of sight. Frame by frame the better one can switch between them, so the
model flips. The smoother (`PoseSmoother`):

- **Keeps the closer solution:** of the two, the one whose orientation is closest to the current
  smoothed pose, as long as its error is at most twice the better one's plus a pixel.
- **Filters with a One Euro filter** (Casiez, Roussel and Vogel, CHI 2012): position by linear
  and orientation by spherical interpolation toward each frame, by a share that grows with the
  speed. Still, the cutoff is 1.5 Hz, which smooths the jitter away; turning, it rises by 0.03 Hz
  per degree a second (moving, 0.02 Hz per millimeter a second), so a flick comes through
  nearly without lag.
- **Waits on a jump:** a turn over 45° in one frame is taken only when the next frame agrees
  (the flip, when only the wrong solution is found, lasts one frame); then without filtering.
- **Holds briefly:** the pose stays for 300 ms after the marker is lost, and a detection after
  that starts afresh with POSIT's better solution.

## Stability {#stability}

The first device tests found the pose too unsteady for the wrist's gestures: a still watch's
face jumped by degrees from frame to frame, enough to read as a flick. Four changes:

1. **Corners to a fraction of a pixel** (`refine.js`): js-aruco2 finds the corners on its
   thresholded outline, to the nearest pixel. Each edge is found again in the grey image, at up
   to 24 points along it, where the brightness rises fastest from the black border to the white
   quiet zone (a parabola through the samples around the peak); a line is fitted through them,
   and the corners are where the lines meet.
2. **The pose refined** against those corners, as above.
3. **The One Euro filter** instead of halfway each frame.
4. **The marker's region at full resolution** (`app.js`, `searchRegion`): once found, the next
   frame is looked at first around where it was (0.9 of the marker's side beyond it each way),
   cropped from the camera's full resolution, at most 480 pixels across. A marker 16 pixels
   wide at the detection's 640 is 48 at the camera's 1920, at a fraction of the cost of the
   whole frame. Where it isn't found there, the whole frame is searched. `?region=0` turns it
   off. The detection's width adapts to the whole frame's search time only.

Measured on made-up frames (`viewer/test/support/camera.mjs`: the watch rendered at a known pose
with lens blur, motion blur, sensor noise of 12 grey levels and a hand's tremor), at 640 pixels:

| What                                          | Before       | After         |
|-----------------------------------------------|--------------|---------------|
| Corners' error at 40 cm (rms)                 | 0.6 px       | 0.25 px       |
| Still at 35 cm: the face between frames (rms) | 6.8°, to 26° | 0.5°, to 1°   |
| Still at 45 cm: the same                      | 4.0°, to 20° | 1.2°, to 3.5° |
| Gestures read from a still or a slow turn     | flicks       | none          |

The values are tuned on those frames; the device tests are where they get checked.

## Verified

`viewer/test/viewer.test.mjs` draws a 120-pixel marker facing a 640-pixel-wide camera model.
The distance comes out within 3 % of `focal length × 20 mm / 120 px`, and the orientation within
3 degrees of facing the camera. `viewer/test/tracking.test.mjs` runs sequences of made-up frames
through the whole pipeline: the corners' refinement, a still watch's steadiness, and that a quick
turn is a flick (also one that turns the marker out of sight) and a slow one isn't.
