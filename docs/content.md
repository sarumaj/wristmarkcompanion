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
`js/fun-models.js`, `js/aviation-models.js`, `js/clock-models.js`, `js/nature-models.js`,
`js/pose-models.js`, `js/scene-models.js`, `js/science-models.js`, `js/play-models.js`,
`js/life-models.js`, `js/fair-models.js`), so there are no asset files and nothing to license apart
from this project's own code (GPL-3.0) and Natural Earth's land, which is in the public domain. Each
stands on the marker's face, sized from the marker's side, and moves a little so that it reads as
3D. The pictures are rendered from the models themselves, at a fixed date
(`viewer/tools/render-models.mjs`): run it after adding or changing a model; a test fails while a
mapped model has no picture.

| ID  | Picture                                              | Model           | What                                                                                                                                                                 |
|-----|------------------------------------------------------|-----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0   | ![Moon phase](images/models/moon.webp)               | `moon`          | The moon in its phase now, lit from the sun's side wherever the camera is; a label with the lit share and the next full or new moon                                  |
| 1   | ![Earth, day and night](images/models/earth.webp)    | `earth`         | The Earth with day and night as they are now, the terminator moving; a yellow meridian at the viewer's time zone                                                     |
| 2   | ![Robot](images/models/robot.webp)                   | `robot`         | A robot mascot: it bobs, looks around, blinks and waves                                                                                                              |
| 3   | ![Snow globe](images/models/snowglobe.webp)          | `snowglobe`     | A snow globe with a fir tree, the snow drifting down                                                                                                                 |
| 4   | ![Cube](images/models/cube.webp)                     | `cube`          | Placeholder: a cube with a color per face, turning slowly                                                                                                            |
| 5   | ![Torus knot](images/models/knot.webp)               | `knot`          | Placeholder: a torus knot above the marker, turning                                                                                                                  |
| 6   | ![Planet](images/models/planet.webp)                 | `planet`        | Placeholder: a planet with a ring and a moon orbiting it                                                                                                             |
| 7   | ![Crystal](images/models/crystal.webp)               | `crystal`       | Placeholder: a flat-shaded crystal floating up and down                                                                                                              |
| 8   | ![The planets today](images/models/orrery.webp)      | `orrery`        | The planets around the sun as they stand today: true directions, distances not to scale; a label with the date                                                       |
| 9   | ![Landing](images/models/landing.webp)               | `landing`       | A plane landing on a runway along the watch: approach, flare, touchdown, rollout, with edge and approach lights                                                      |
| 10  | ![Fireworks](images/models/fireworks.webp)           | `fireworks`     | Rockets rising from the watch and bursting, the sparks falling and fading                                                                                            |
| 11  | ![World clock](images/models/worldClock.webp)        | `worldClock`    | The Earth seen from above the North Pole, day and night as they are now, and eight cities around it at their longitudes with their local time                        |
| 12  | ![Watch movement](images/models/movement.webp)       | `movement`      | An open mechanical movement under a glass dome: the gear train turning, the escape wheel stepping, the balance swinging at 2.5 Hz, the hands showing the time now    |
| 13  | ![Hourglass](images/models/hourglass.webp)           | `hourglass`     | An hourglass that runs out every minute and turns over at the full minute                                                                                            |
| 14  | ![Helicopter](images/models/helicopter.webp)         | `helicopter`    | A helicopter on a helipad: the rotor spins up, it lifts off, hovers turning once around, lands and spins down; the pad's lights chase while it's away                |
| 15  | ![Dice](images/models/dice.webp)                     | `dice`          | Two dice thrown onto the watch every five seconds: they tumble in, bounce and land on a new roll                                                                     |
| 16  | ![Campfire](images/models/campfire.webp)             | `campfire`      | A campfire in a ring of stones: flickering flames, rising embers and a flickering orange light                                                                       |
| 17  | ![Aquarium](images/models/aquarium.webp)             | `aquarium`      | A glass bowl with sand, swaying plants, three fish swimming their rounds and bubbles rising                                                                          |
| 18  | ![Lighthouse](images/models/lighthouse.webp)         | `lighthouse`    | A red and white lighthouse on a rock in the sea, its beam turning every six seconds                                                                                  |
| 19  | ![Hot-air balloon](images/models/balloon.webp)       | `balloon`       | A striped hot-air balloon drifting above the watch, the burner firing every eight seconds                                                                            |
| 20  | ![Rocket launch](images/models/rocket.webp)          | `rocket`        | A rocket launch every 14 seconds: the countdown, ignition and smoke, lift-off out of sight                                                                           |
| 21  | ![Attitude indicator](images/models/attitude.webp)   | `attitude`      | An aircraft's attitude indicator: its ball stays level with the camera's image, so turning the wrist banks it and tilting the watch pitches it; a label reads both   |
| 22  | ![Marble maze](images/models/maze.webp)              | `maze`          | A round labyrinth: tilt the watch away from the camera on one side and the ball rolls that way, through the walls' gaps to the middle; a label says how long it took |
| 23  | ![Penguin](images/models/penguin.webp)               | `penguin`       | A penguin on an ice floe: it shifts from foot to foot, blinks, flaps, and keeps upright in the image as the wrist turns, swaying back; a tap makes it hop            |
| 24  | ![Windmill](images/models/windmill.webp)             | `windmill`      | A Dutch windmill among tulips, its sails turning in a wind that swells now and then; a tap brings a gust                                                             |
| 25  | ![Sailboat](images/models/sailboat.webp)             | `sailboat`      | A sailboat sailing in circles on waves, heeling and rocking; a tap makes it come about and sail the other way                                                        |
| 26  | ![Ferris wheel](images/models/ferrisWheel.webp)      | `ferrisWheel`   | A Ferris wheel turning, its gondolas hanging level; the rim's lights chase after dark (18 to 7 o'clock), or for a while after a tap                                  |
| 27  | ![Bonsai](images/models/bonsai.webp)                 | `bonsai`        | A bonsai as the season is today: blossoms in spring, green in summer, orange leaves falling in autumn, snow in winter; a tap shakes it                               |
| 28  | ![Atom](images/models/atom.webp)                     | `atom`          | A carbon atom as Bohr drew it: twelve nucleons, six electrons on three tilted orbits; a tap excites them                                                             |
| 29  | ![DNA](images/models/dna.webp)                       | `dna`           | A strand of DNA turning, its base pairs colored by base; a tap unzips it in the middle for a moment                                                                  |
| 30  | ![Newton's cradle](images/models/newtonsCradle.webp) | `newtonsCradle` | A Newton's cradle: the outer ball swings in, the one at the other end swings out, losing a little each time; a tap lifts one more (up to three)                      |
| 31  | ![Metronome](images/models/metronome.webp)           | `metronome`     | A metronome ticking at 60 to 144 beats a minute, a light on each beat (no sound); a tap sets the next tempo                                                          |
| 32  | ![Volcano](images/models/volcano.webp)               | `volcano`       | A volcano on an island, smoking; every 15 seconds it erupts, glowing bombs flying in arcs; a tap erupts it                                                           |
| 33  | ![UFO](images/models/ufo.webp)                       | `ufo`           | A UFO over a meadow: its beam lifts the cow up and lets it down again, unharmed; a tap starts the beam                                                               |
| 34  | ![Toy train](images/models/train.webp)               | `train`         | A toy steam train going round a circular track, puffing smoke; a tap blows the whistle and it speeds up                                                              |
| 35  | ![Birthday cake](images/models/cake.webp)            | `cake`          | A birthday cake with six flickering candles; a tap blows them out, smoke rises, and they light again                                                                 |
| 36  | ![Jellyfish](images/models/jellyfish.webp)           | `jellyfish`     | A glowing jellyfish over rocks, its bell pulsing, tentacles trailing, rising with each pulse; a tap makes it swim up                                                 |
| 37  | ![Butterflies](images/models/butterflies.webp)       | `butterflies`   | Three butterflies fluttering over a patch of flowers, each on its own path; a tap scatters them                                                                      |
| 38  | ![Carousel](images/models/carousel.webp)             | `carousel`      | A carousel: a striped roof with chasing lights, six horses going up and down; a tap speeds it up                                                                     |
| 39  | ![Race track](images/models/raceTrack.webp)          | `raceTrack`     | Two race cars lapping an oval, the lead changing; a label counts the laps; a tap boosts the red one                                                                  |
| 40  | ![Satellite](images/models/satellite.webp)           | `satellite`     | A satellite circling the Earth (day and night as now) on the space station's inclined orbit, an orbit in 20 seconds; a tap pings it                                  |
| 41  | ![Sundial](images/models/sundial.webp)               | `sundial`       | A garden sundial set for 50° north: the shadow falls where the sun would put it at your clock's time, none at night; a tap reads it                                  |
| 42  | ![Lava lamp](images/models/lavaLamp.webp)            | `lavaLamp`      | A lava lamp, wax blobs rising and sinking and stretching; a tap changes its colors                                                                                   |

### How the watch is held

The attitude indicator, the maze and the penguin respond to the watch's pose as the camera sees
it (`js/seen.js`): without the phone's sensors, the camera is taken as upright, so the image's
down stands in for gravity. The attitude indicator and the penguin keep level with the image;
the maze is looked into, so its "down" is the camera's line of sight, and the ball rolls toward
the side tilted away from the camera. Each reads the camera's direction in its own frame just
before it is drawn (`onBeforeRender`), with no other data from the viewer.

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
