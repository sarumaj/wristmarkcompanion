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
- **An ID without an entry** shows the axis gizmo, and the status says "no content": the
  marker page shows every ID, the watch only the mapped ones.
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
  wrist to roll"), "Marker 23 has no model yet" for an ID without one, and tips when the watch
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
`js/fun-models.js`, `js/aviation-models.js`, `js/clock-models.js`, `js/nature-models.js`), so
there are no asset files and nothing to license apart from this project's own code (GPL-3.0)
and Natural Earth's land, which is in the public domain. Each stands on the marker's face,
sized from the marker's side, and moves a little so that it reads as 3D.

![The moon on 2026-11-16, the Earth at noon UTC that day, the robot and the snow globe](images/models.png)

![The planets on 2026-11-16, the landing at its flare, the fireworks](images/models-2.png)

![The world clock at 14:23 UTC, the watch movement, the hourglass and the helicopter hovering](images/models-3.png)

![Dice rolling in, the campfire, the aquarium and the rocket lifting off](images/models-4.png)

| ID  | Model        | What                                                                                                                                                              |
|-----|--------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0   | `moon`       | The moon in its phase now, lit from the sun's side wherever the camera is; a label with the lit share and the next full or new moon                               |
| 1   | `earth`      | The Earth with day and night as they are now, the terminator moving; a yellow meridian at the viewer's time zone                                                  |
| 2   | `robot`      | A robot mascot: it bobs, looks around, blinks and waves                                                                                                           |
| 3   | `snowglobe`  | A snow globe with a fir tree, the snow drifting down                                                                                                              |
| 4   | `cube`       | Placeholder: a cube with a color per face, turning slowly                                                                                                         |
| 5   | `knot`       | Placeholder: a torus knot above the marker, turning                                                                                                               |
| 6   | `planet`     | Placeholder: a planet with a ring and a moon orbiting it                                                                                                          |
| 7   | `crystal`    | Placeholder: a flat-shaded crystal floating up and down                                                                                                           |
| 8   | `orrery`     | The planets around the sun as they stand today: true directions, distances not to scale; a label with the date                                                    |
| 9   | `landing`    | A plane landing on a runway along the watch: approach, flare, touchdown, rollout, with edge and approach lights                                                   |
| 10  | `fireworks`  | Rockets rising from the watch and bursting, the sparks falling and fading                                                                                         |
| 11  | `worldClock` | The Earth seen from above the North Pole, day and night as they are now, and eight cities around it at their longitudes with their local time                     |
| 12  | `movement`   | An open mechanical movement under a glass dome: the gear train turning, the escape wheel stepping, the balance swinging at 2.5 Hz, the hands showing the time now |
| 13  | `hourglass`  | An hourglass that runs out every minute and turns over at the full minute                                                                                         |
| 14  | `helicopter` | A helicopter on a helipad: the rotor spins up, it lifts off, hovers turning once around, lands and spins down; the pad's lights chase while it's away             |
| 15  | `dice`       | Two dice thrown onto the watch every five seconds: they tumble in, bounce and land on a new roll                                                                  |
| 16  | `campfire`   | A campfire in a ring of stones: flickering flames, rising embers and a flickering orange light                                                                    |
| 17  | `aquarium`   | A glass bowl with sand, swaying plants, three fish swimming their rounds and bubbles rising                                                                       |
| 18  | `lighthouse` | A red and white lighthouse on a rock in the sea, its beam turning every six seconds                                                                               |
| 19  | `balloon`    | A striped hot-air balloon drifting above the watch, the burner firing every eight seconds                                                                         |
| 20  | `rocket`     | A rocket launch every 14 seconds: the countdown, ignition and smoke, lift-off out of sight                                                                        |

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

## More models

[Model ideas](model-ideas.md) collects what could replace the placeholders, by what each one
needs: from the moon phase and a globe with day and night to aviation, navigation and playful
ones.
