# Interaction with the models

Status: **built** (2026-11-17): the wrist's gestures, touch, pinching to resize and the other
hand. Their thresholds are first guesses; the device tests will tune them.

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

| Model          | Gesture        | Reaction                                             |
|----------------|----------------|------------------------------------------------------|
| Dice           | flick or shake | Thrown at once                                       |
| Tornado        | shake or flick | Spins faster and wider, and calms again              |
| Robot          | flick          | Waves                                                |
| Fireworks      | flick or shake | The rocket waiting longest goes up at once           |
| Campfire       | shake          | Taller flames and a burst of embers                  |
| Treasure chest | shake          | It rattles: the coins jump, or the closed lid knocks |
| Rain cloud     | shake          | A downpour at once, twice the rain                   |
| Orrery         | twist          | The date moves a month either way                    |

A model reacts through an optional `gesture(event)` that returns `true` when it took the gesture
(`js/models.js`).

## Built: showing the moves

Device tests showed the hints in the status line weren't enough: people didn't find out how
to flick or twist. `js/coach.js` shows them instead:

- **A card above the buttons**, the first time a model is seen on a device: a small animated
  picture of each of its moves (tap, flick, shake, twist, tilt) with a line of text, 2.6 s each.
  Which models have shown it is kept in `localStorage` (`wristmark.coached`).
- **The moves of a model** come from its entry in `MODEL_GUIDES`: its actions (`touch` is a tap,
  `gesture` names the move) and `tilt: true` for the models that follow the watch's tilt.
- **The same pictures, still,** on each action button, so the button and its move look alike;
  **?** after the buttons plays the card again. The help's list of moves has them too.
- **The pictures** are SVG built in script and animated by `style.css` (`move-<kind>`), since
  the Content-Security-Policy allows no inline styles; `prefers-reduced-motion` stops them.

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
  without its own `touch` but with one gesture action (the dice, the tornado, the robot, the
  fireworks, the campfire) does that action. An action button (`touch: true` in `MODEL_GUIDES`)
  does each model's tap, for the keyboard and for whoever can't tap.
- **Two fingers** stay the pinch: a second finger ends a drag, and no tap follows.

The models with a tap of their own:

| Model           | Tap                                                                |
|-----------------|--------------------------------------------------------------------|
| Orrery          | A planet says its name and its distance from the sun on the date   |
| Aquarium        | The fish dart off, four times as fast, for two seconds             |
| Balloon         | The burner fires, between burns                                    |
| Rocket          | The countdown starts at T-3, while the pad waits                   |
| Maze            | The ball goes back to the start                                    |
| Tux             | He hops, flapping                                                  |
| Windmill        | A gust: the sails speed up for three seconds                       |
| Sailboat        | It comes about and sails the other way round                       |
| Ferris wheel    | The rim's lights chase for six seconds, by day too                 |
| Bonsai          | Shaken: petals, leaves or snow come down, as the season has them   |
| Atom            | The electrons speed up and glow brighter for three seconds         |
| DNA             | It unzips in the middle and closes again                           |
| Newton's cradle | One more ball is lifted (one to three), and it starts again        |
| Metronome       | The next tempo: 60, 80, 96, 120, 144 beats a minute                |
| Volcano         | It erupts, between eruptions                                       |
| UFO             | The beam comes on, between abductions                              |
| Toy train       | The whistle: a burst of steam, faster for four seconds             |
| Gumball machine | The knob turns, a gumball rolls into the tray and tells its flavor |
| Jellyfish       | It pulses hard and swims up                                        |
| Butterflies     | They scatter, higher and faster, for three seconds                 |
| Carousel        | Faster for five seconds                                            |
| Race track      | The red car gets a boost for two seconds                           |
| Satellite       | A ping: its light flashes, a ring spreads                          |
| Sundial         | It says the time it reads, or that it's night                      |
| Lava lamp       | The next colors: sunset, ocean, lime                               |
| Castle          | The drawbridge goes up, or down                                    |
| House           | The lights switch, the other way from what the hour has them       |
| Snowman         | It tips its hat                                                    |
| Puzzle cube     | It hurries: three times as fast until it is solved                 |
| Black hole      | It gets a star, pulled into a stream as it spirals in, and flares  |
| T. rex          | It rears its head and roars, jaws wide, its tiny arms waving       |
| Glimmer         | It hops and spins, its crystal flaring and throwing sparkles       |
| Bee hive        | The swarm pours out and circles the hive for five seconds          |
| Skate park      | A kickflip on the next air: the board flips under the feet         |
| Treasure chest  | It closes, or opens                                                |
| Rain cloud      | Lightning, twice                                                   |

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

## Built: the hand in front

**Occlusion** (`js/occlusion.js`). The camera's image is flat, so a model is drawn over
everything in it, a finger in front included. While hand tracking is on, each hand becomes a
rough hand of spheres and tubes (8 mm fingers, 11 mm palm bones, the palm a fan of triangles),
drawn first and into the depth buffer only: invisible, but the model's pixels behind it fail
the depth test, and the real hand shows through.

- **Where the hand is:** MediaPipe gives each hand's points in the image and in meters about
  the hand's center (its world landmarks). The offset from the camera that projects the second
  onto the first is a linear least squares fit (`placeHand`), so the hand's size and how it's
  turned count, not a guessed palm length.
- **A margin:** the hand is put 10 mm farther than measured. A hand guessed a little too near
  would cut into a model it's only next to; a little too far only shows the model over the
  fingertip touching it.
- **Limits:** only the hands hide the model, nothing else in the picture; the shape is rough
  (a few pixels off at the edges); it follows the hands 20 times a second, so a fast hand's
  edge lags. The debug view draws it in color. `?occlusion=0` turns it off, to compare.

Not chosen for now: WebXR's depth sensing. It is only in Chrome on ARCore phones with depth
(not in the Android app's WebView, not on iPhones), its AR session takes the camera, so finding
the marker would need Chrome's raw camera access as a second way of running, and ARCore's depth
is tuned for half a meter and more, farther than the watch is held.

**The model kept under a hand** (`js/smoothing.js`, `PoseSmoother.lost(now, holdMs)`). A hand
reaching for the model usually covers the marker, and the model then went within 0.3 s.

- **Under a hand:** while hand tracking sees a hand within half a marker's width of where the
  marker was (`handOver`), the pose stays, up to 4 s (`HAND_HOLD_MS`).
- **Otherwise** the model fades out over 1 s (`FADE_HOLD_MS`, the overlay's opacity) instead of
  going at once.
- **Found again** after more than the smoother's own 0.3 s, the pose glides there, 30 % of the
  way each frame for 0.25 s, whatever the turn: the filter alone, after a long gap, jumps.
- The phone's motion sensors could turn the held model with the phone, but hand tracking is
  for a phone on a stand or a laptop, which don't turn: left out.

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
