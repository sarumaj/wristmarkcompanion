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
- **The turn's speed over 60 ms**, not frame to frame: the pose's jitter divided by one frame's
  time would look like a turn.
- **The planar flip isn't a flick:** a jump of the face by more than 45° in one frame, or more
  than 20° straight out of stillness, starts the recognizer afresh, as does a gap in tracking
  over 0.25 s. Only the smoothed pose drives it.
- **Turned out of sight:** a marker lost within 0.15 s of turning at 60 % of a flick's speed
  was turned away in a flick: a quick turn blurs the marker or turns it edge on.
- **Steady enough** since the pose's stability work
  ([003](decisions/003-pose.md#stability)): before it, a still watch's jitter read as flicks.
- **Tested** on made-up movements at 30 frames a second (`viewer/test/gestures.test.mjs`): each
  gesture, and that a hand holding still, a slow turn and the flip make none. And end to end on
  rendered frames (`viewer/test/tracking.test.mjs`).

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

| Model           | Tap                                                                  |
|-----------------|----------------------------------------------------------------------|
| Orrery          | A planet says its name and its distance from the sun on the date     |
| Aquarium        | The fish dart off, four times as fast, for two seconds               |
| Balloon         | The burner fires, between burns                                      |
| Rocket          | The countdown starts at T-3, while the pad waits                     |
| Maze            | The ball goes back to the start                                      |
| Penguin         | It hops, flapping                                                    |
| Windmill        | A gust: the sails speed up for three seconds                         |
| Sailboat        | It comes about and sails the other way round                         |
| Ferris wheel    | The rim's lights chase for six seconds, by day too                   |
| Bonsai          | Shaken: petals, leaves or snow come down, as the season has them     |
| Atom            | The electrons speed up and glow brighter for three seconds           |
| DNA             | It unzips in the middle and closes again                             |
| Newton's cradle | One more ball is lifted (one to three), and it starts again          |
| Metronome       | The next tempo: 60, 80, 96, 120, 144 beats a minute                  |
| Volcano         | It erupts, between eruptions                                         |
| UFO             | The beam comes on, between abductions                                |
| Toy train       | The whistle: a burst of steam, faster for four seconds               |
| Birthday cake   | The candles go out, smoke rises; they light again after five seconds |
| Jellyfish       | It pulses hard and swims up                                          |
| Butterflies     | They scatter, higher and faster, for three seconds                   |
| Carousel        | Faster for five seconds                                              |
| Race track      | The red car gets a boost for two seconds                             |
| Satellite       | A ping: its light flashes, a ring spreads                            |
| Sundial         | It says the time it reads, or that it's night                        |
| Lava lamp       | The next colors: sunset, ocean, lime                                 |
| Castle          | The drawbridge goes up, or down                                      |
| House           | The lights switch, the other way from what the hour has them         |
| Snowman         | It tips its hat                                                      |
| Puzzle cube     | It hurries: three times as fast until it is solved                   |
| Black hole      | It gets a star, which spirals in, stretched, and flares              |
| Treasure chest  | It closes, or opens                                                  |
| Rain cloud      | Lightning, twice                                                     |

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

## Built, to try: the other hand in front of the camera

Switched on with the hand button or `H` (`?hands` from the start), off by default
(`js/hands.js`). [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)'s
hand landmarker (Apache-2.0) finds up to two hands' 21 points in the camera's image, in the
browser, 20 times a second; the hand that isn't wearing the watch (its wrist away from the
watch) can touch the model. It suits a held-still watch: a phone on a stand, a laptop's camera.

- **Point at the model** with the index finger (the others curled): a tap, as a finger on the
  screen gives. Once per touch: the finger has to leave the model, and 700 ms pass, for the
  next. An open hand passing over the model does nothing.
- **Pinch the model** (thumb and index meet on it), then move: it turns as a drag does, from
  wherever the hand goes; opening the fingers, or the hand leaving the picture, lets go.
- **Wave** an open hand (all four fingers out), its palm back and forth, turning three times
  within 1.3 s, each swing over a third of the palm's length: the models' shake, for when the
  wrist can't.
- **Swipe** an open hand across the picture: the palm across at least 1.6 palm lengths and 15 %
  of the picture within 0.4 s, mostly sideways. With the watch connected
  ([004](decisions/004-control-channel.md)) its next or previous marker; otherwise the model
  spins that way. After a swipe or a wave, neither comes again for 0.9 s.
- **A cursor** shows the free hand's fingertip: a ring, filled over the model, small while
  pinching, in the accent while it holds the model. The pointer is smoothed by a One Euro
  filter, as the watch's pose is.
- **The debug view draws what the tracking sees** (`js/marks.js`): each hand's 21 points and
  bones, the free hand's in the accent with its state (open, pointing, pinching, grabbing), the
  hand wearing the watch in grey, and the pointer. The marker's outline, the region it was
  found in, and the watch's turn speed against a flick's.
- **Depth is a guess** from one camera, so the touch is on the image: where the finger covers
  the model. Reaching behind the model counts as touching it.

The cost, as foreseen:

| What        | Size or effect                                                                  |
|-------------|---------------------------------------------------------------------------------|
| Library     | `vision_bundle.mjs`, 156 KB, from npm (`@mediapipe/tasks-vision`, pinned)       |
| WebAssembly | 14.6 MB (gzip on), compiled under the CSP's `'wasm-unsafe-eval'`                |
| Model       | `hand_landmarker.task`, 7.8 MB, Google's file at version 1, its SHA-256 checked |
| Loaded      | On first switching on, from the viewer's own origin; nothing otherwise          |
| Processor   | The GPU where the browser lets it, else the CPU; the debug view shows its time  |

`hand-model.txt` holds the model's address and SHA-256, for the Dockerfile and the tests. After
the device tests: whether the phone keeps its frame rate with it on, the thresholds (a pinch at
0.3 of the palm's length, pointing), and whether it earns a place beyond an experiment.

## Not chosen: commands through the marker ID

Watch buttons could switch between IDs of the same model to send commands (e.g. IDs 0–9 as one
model in 10 states). Not planned for now; the ID stays the choice of model.
