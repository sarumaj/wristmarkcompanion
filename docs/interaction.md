# Interaction with the models

Status: **a first version is built** (2026-11-16): the wrist's gestures and pinching to resize.
Their thresholds are first guesses; the device tests' pose data will tune them (how steady the
pose is, and how much CPU detection leaves on a mid-range phone).

## Built: the wrist's gestures

`js/gestures.js` reads the smoothed pose each frame and recognizes four gestures. The debug
overlay shows the last one; a chip on the stage confirms a gesture the model reacted to.

| Gesture | Recognized when                                                           |
|---------|---------------------------------------------------------------------------|
| Flick   | The watch's face turns faster than 220° a second                          |
| Twist   | The watch turns more than 35° about its own axis within 0.4 s, either way |
| Shake   | Its sideways speed (over 80 mm/s) reverses three times within 0.8 s       |
| Hold    | It stays still (under 20°/s and 30 mm/s) for 0.7 s after moving           |

- **Not twice in a row:** a gesture isn't recognized again within 0.6 s.
- **The planar flip isn't a flick:** a jump of the face by more than 30° in one frame starts the
  recognizer afresh, as does a gap in tracking over 0.25 s. Only the smoothed pose drives it.
- **Tested** (`viewer/test/gestures.test.mjs`) on made-up movements at 30 frames a second: each
  gesture, and that a hand holding still, a slow turn and the flip make none.

Which models react:

| Model      | Gesture        | Reaction                                   |
|------------|----------------|--------------------------------------------|
| Dice       | flick or shake | Thrown at once                             |
| Snow globe | shake or flick | The snow swirls up and settles again       |
| Robot      | flick          | Waves                                      |
| Fireworks  | flick or shake | The rocket waiting longest goes up at once |
| Campfire   | shake          | Taller flames and a burst of embers        |
| Orrery     | twist          | The date moves a month either way          |

A model reacts through an optional `gesture(event)` that returns `true` when it took the gesture
(`js/models.js`).

## Built: the size by hand

Two fingers pinching, the mouse wheel or a trackpad's pinch resize the model (`js/zoom.js`,
[content](content.md#the-mapping)).

## Built: one finger on the model

The other hand's way in, on a phone its thumb, on a laptop a mouse (`js/touch.js`):

- **A drag turns the model** about the watch's center, like a dial: it follows the pointer's
  angle around the center as the watch is seen, and coasts on after release, slowing down. The
  left and right arrow keys turn it by 15°; `0` or a double tap puts it back with the size.
  While a model shows, one finger on the camera's image turns it instead of scrolling the page.
- **A tap on the model** (three.js's raycaster on the shown meshes) makes it hop, and does what
  it does. A model reacts through an optional `touch(hit)`, `hit` being the mesh and the point
  tapped, which returns the chip's text, or `{text, tick: false}` to tell something. A model
  without its own `touch` but with one gesture action (the dice, the snow globe, the robot, the
  fireworks, the campfire) does that action. An action button (`touch: true` in `MODEL_GUIDES`)
  does each model's tap, for the keyboard and for whoever can't tap.
- **Two fingers** stay the pinch: a second finger ends a drag, and no tap follows.

The models with a tap of their own:

| Model    | Tap                                                              |
|----------|------------------------------------------------------------------|
| Orrery   | A planet says its name and its distance from the sun on the date |
| Aquarium | The fish dart off, four times as fast, for two seconds           |
| Balloon  | The burner fires, between burns                                  |
| Rocket   | The countdown starts at T-3, while the pad waits                 |

## Further ideas

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

### More taps

The moon, the globes, the watch movement and the hourglass hop and turn but do nothing of
their own on a tap yet: a city's time on the world clock, the moon's next phases, turning the
hourglass over are candidates.

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
