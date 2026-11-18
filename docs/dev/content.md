# Content: what each marker shows

The viewer shows a model for each marker ID that `viewer/public/content.json` maps, and draws
the axis gizmo for any other ID. It works the same on a phone (rear camera) and on a laptop
(webcam).

## The mapping

```json
{
  "markers": {
    "0": { "model": "cube", "name": "Cube" },
    "1": { "model": "knot", "name": "Torus knot" }
  }
}
```

- **Keys** are marker IDs, 0-49 (DICT_4X4_50, [002](decisions/002-marker-dictionary.md)).
- **`model`** is one of the models in `viewer/public/js/models.js`. **`name`** is shown in the
  status line.
- **Checked on load** (`js/content.js`): an unknown key, model or field, or an ID out of range,
  stops the viewer with the reason, instead of showing nothing. `viewer/test` checks the shipped
  file and the check itself.
- **The watch shows only the mapped IDs:** `tools/generate-content-ids.mjs` writes them into
  `watch/source/MarkerContent.mc`, which its next and previous buttons and its automatic cycle
  step through. Run it after changing the mapping; CI fails while the watch's list is stale.
- **Every ID has a model**, 0 to 49. An ID without an entry (in a changed mapping) would show
  the axis gizmo, and the status would say it has no model yet.
- **Size:** each model is built 2.5 times the marker's size (`?scale=` sets it), so that it reads
  well at arm's length; it may reach well beyond the watch. Two fingers pinching, the mouse
  wheel or a trackpad's pinch make it larger or smaller (0.3 to 6 times that), a double tap or
  double click puts it back. One finger or the mouse turns it about the watch, a tap makes it
  react ([interaction](interaction.md#built-one-finger-on-the-model)).
- **The watch's display goes black** under a model: the viewer draws the D2 Mach 1's round
  display (416 pixels across, the marker 234) black over the camera's image, so the model stands
  on a dark watch face instead of the marker. Detection still reads the camera's own image. In
  the debug view the marker shows through; `?screen=0` leaves it visible.
- **What the status says:** the model's name and its hint ("Dice · Tap it, flick or shake your
  wrist to roll"), "Marker N has no model yet" for an ID without one, and tips when the watch
  hasn't been seen for 6 seconds. Buttons under a model do what its gestures do (`MODEL_GUIDES` in
  `js/models.js`).
- **Help, keys, full screen:** the **Help** dialog (also `?`) explains the steps, tips, gestures
  and keys: `+` `−` `0` resize, `F` full screen, `D` the debug view. Full screen is the page's
  own where the browser has it, the stage filling the window elsewhere (Safari on an iPhone). A
  second camera brings a switch button.
- **Switching:** the model changes when the camera sees another ID (the watch's next and
  previous buttons, or its automatic cycle). The new marker's pose starts afresh, without the
  smoothing of the old one.

## The models

All of them are generated in code with three.js (`js/models.js`, `js/sky-models.js`,
`js/fun-models.js`, `js/aviation-models.js`, `js/clock-models.js`, `js/nature-models.js`,
`js/pose-models.js`, `js/scene-models.js`, `js/science-models.js`, `js/play-models.js`,
`js/life-models.js`, `js/fair-models.js`, `js/home-models.js`, `js/wonder-models.js`), so there are
no asset files and nothing to license apart from this project's own code (GPL-3.0) and Natural
Earth's land, which is in the public domain. Each stands on the marker's face, sized from the
marker's side, and moves a little so that it reads as 3D. The pictures are rendered from the models
themselves, at a fixed date (`viewer/tools/render-models.mjs`): run it after adding or changing a
model; a test fails while a mapped model has no picture.

Their pictures and what each one does: [the models](../user/models.md), with the marker IDs
(the pictures are `docs/user/images/models/`).

### How the watch is held

The attitude indicator, the maze and the penguin respond to the watch's pose as the camera sees it
(`js/seen.js`): without the phone's sensors, the camera is taken as upright, so the image's down
stands in for gravity. The attitude indicator and the penguin keep level with the image; the maze is
looked into, so its "down" is the camera's line of sight, and the ball rolls toward the side tilted
away from the camera. Each reads the camera's direction in its own frame just before it is drawn
(`onBeforeRender`), with no other data from the viewer.

On a phone, the button **Use the phone's tilt** under these models switches on its motion sensors
(`startMotion`; Safari on an iPhone asks first): gravity then comes from them, from
`deviceorientation`'s tilt (beta and gamma) turned with the screen. The attitude indicator and the
penguin keep level with the real horizon, and the maze's ball rolls downhill: hold the watch flat
and look down at it. Readings older than a second count as none, and the image's down takes over
again. A laptop has no sensors; the button is offered only on touch screens.

### The moon, the Earth and the planets

- **Only the time:** the sun's and the moon's positions come from low-precision formulas
  (`js/sky.js`: the Astronomical Almanac's for the sun, the main terms of Meeus's for the moon).
  `viewer/test/sky.test.mjs` checks them against the USNO's published equinox, solstice and
  moon phases: within 0.05 degrees and an hour. No location is asked for. The globe's meridian
  is the browser's time zone offset (15 degrees an hour), so with daylight saving time it's
  an hour's worth east of the zone's usual meridian.
- **The planets:** JPL's Keplerian elements ("Approximate Positions of the Planets", Table 1,
  valid 1800-2050). The test checks the Earth against the sun's position and Mars, Jupiter and
  Saturn against their oppositions of 2024 and 2025: within a degree. The orrery shows only the
  directions truly: Neptune's orbit is 78 times Mercury's, too much for a watch.
- **Another day:** `?date=2026-12-24T18:00Z` shows the moon, the globe and the planets at that
  time, the clock running on from it.
- **The land:** `js/land.js`, a 360x180 grid of one bit per degree, generated from Natural
  Earth's 1:110m land by `tools/generate-land.mjs` (its header has the download). Regenerate
  it rather than editing it.
- **Orientation:** a model can't know where north is or where the sun stands in the room, so
  the globe's north points to the watch's top and the moon's lit side is set relative to the
  camera, as the phase looks from the northern hemisphere.

A model from a file (glTF) would need three.js's loader added to the image and its license
recorded here. Large files need the owner's approval first ([CI](ci.md)).

## The debug overlay

The **Debug** button, or `?debug` in the address, shows a panel over the camera image with the
numbers the range tests ([device tests](device-tests.md)) record:

| Row           | Meaning                                                                        |
|---------------|--------------------------------------------------------------------------------|
| `Marker`      | The marker shown, or `–`                                                       |
| `Distance`    | The smoothed pose's distance from the camera, in millimeters                   |
| `FPS`         | Frames processed in the last second                                            |
| `Detected`    | The share of those frames in which the marker was found                        |
| `Detect time` | How long detection and pose took per frame, on average                         |
| `Camera`      | The camera's resolution                                                        |
| `Detected at` | The resolution frames are scaled to for detection                              |
| `Gesture`     | The last gesture of the wrist and how long ago ([interaction](interaction.md)) |

FPS, the detection rate and the detection time are green, amber or red by how good they are, and
a chart under the rows shows the last ten seconds of the detection rate and FPS.

With the overlay on, the gizmo is drawn with the model too, which shows how well the model sits
on the marker. The distance depends on the assumed field of view and marker size
([003](decisions/003-pose.md)): `?fov=` and `?size=` set them.
