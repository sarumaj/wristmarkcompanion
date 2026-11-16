# Interaction with the models (planned)

Status: **planned, after the device tests (milestone 4)**. Nothing here is built yet. The spec
says to wait for the device results before optimizing, and these features depend on them: how
steady the pose is, and how much CPU detection leaves on a mid-range phone.

## Chosen

### Moving the watch

The viewer already tracks the marker's position and orientation in every frame
([003](decisions/003-pose.md)), so movements of the wrist can drive the model, with no new data
channel and nothing more to download:

| Movement                             | Possible action                       |
|--------------------------------------|---------------------------------------|
| Turning the wrist (about the z axis) | Spin the model, or scrub an animation |
| Tilting the watch toward the phone   | Zoom in, open, or unfold the model    |
| A quick flick (fast change of angle) | Next animation or effect              |
| Holding still for a moment           | Settle, or show a detail              |

- **The hard part:** telling deliberate gestures from hand shake and from the pose's own noise.
  Gestures need thresholds on angle and speed, held for a short time, which the device tests'
  pose data will inform.
- **The planar flip** must not read as a gesture: only the smoothed pose (`PoseSmoother`) drives
  them, never POSIT's raw solutions.

### Touch and clicks in the viewer

Standard pointer input on the page, through the browser's pointer events and three.js:

- **On a phone:** drag to rotate the model, pinch to scale, tap to trigger an animation.
- **On a desktop** (with the marker page on another screen): the same with the mouse and the
  wheel.

It's cheap and works everywhere. On a phone, though, the hand that holds the phone aims the
camera, so touch suits the moments when the watch is held still.

## Conditional: hand gestures in front of the camera

Hand tracking in the browser (e.g. MediaPipe Hands, Apache-2.0, run on the device) is considered
**only if it gives meaningful actions to the hand wearing the watch**, while the other hand holds
the phone. Examples would be a pinch or an open palm by that hand, seen next to the watch.

- **Cost:** several MB of model and WebAssembly. It has to be served from the viewer's own
  origin, because the Content-Security-Policy allows no other, and nothing may leave the
  browser.
- **CPU:** it competes with marker detection for the same frames. Worth it only if the device
  tests show spare capacity on the test phone.
- **Overlap:** many such actions can also be done by moving the watch (above), which costs
  nothing. Hand tracking has to offer something those movements can't.

## Not chosen: commands through the marker ID

Watch buttons could switch between IDs of the same model to send commands (e.g. IDs 0–9 as one
model in 10 states). Not planned for now; the ID stays the choice of model.
