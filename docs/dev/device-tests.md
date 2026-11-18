# Device tests

Status: **to be filled in by the owner** (milestone 4). Optimizing waits for these results.

The prototype has two open questions:

1. **Range:** at what distance does tracking stay reliable with the D2 Mach 1's marker (about
   18.6 mm, [watch](watch.md#layout))?
2. **Session length:** how long does the watch keep the marker visible before the display
   dims or turns off ([watch](watch.md#keeping-the-display-on))?

Fill in the tables below, as many rows as you get to. A `-` is fine where something wasn't
measured; notes are welcome anywhere.

## The guided test

The viewer can walk you through this page and measure most of it itself: open it with `?test`
(the **Device test** link under the viewer), e.g.
`https://8095-dawid.studio.ciepiela.org/?test&size=18.6`, tap **Start the camera**, then work
through the sections under the camera's image.

- **Each step says what to do, aloud too** (spoken prompts and beeps, which can be turned off),
  so that the phone and the watch can stay in your hands; a measurement starts after a
  3-second countdown and takes 10 seconds.
- **It measures** the detection rate, FPS, detection time, the distance shown, the tilt of the
  watch (for the angles, without a protractor), and how still the pose stays: its jitter and
  flips give a suggested "Steady", which you can change.
- **Session length is timed automatically:** the marker's brightness shows when the display
  dims, its loss when it goes off; then the guide asks for a button press and checks whether
  the marker comes back. **It dimmed now** marks the dimming by hand.
- **The models** are measured as soon as the watch shows each marker; you answer whether the
  model sits on the watch and is smooth.
- **Red light (night mode):** range, angle and session runs each have a switch for the watch
  in red light; run the range in a dark room and under a lamp with it.
- **The results stay on the phone** (the browser's storage) until **Report** copies,
  downloads or shares them as this page's tables, filled in.

The tables below are what the report fills in; they also work by hand with the debug overlay.

## Getting set up

### The watch app

Build it on your Mac with the SDK from Garmin's SDK Manager, then copy it onto the watch:

```sh
CONNECTIQ_HOME="$HOME/Library/Application Support/Garmin/ConnectIQ" tools/build-watch.sh 9.3.0
# writes watch/bin/wristmark-d2mach1.prg
```

1. Connect the watch with its USB cable.
2. Copy `watch/bin/wristmark-d2mach1.prg` into the watch's `GARMIN/APPS` folder (Garmin's
   [Your First App](https://developer.garmin.com/connect-iq/connect-iq-basics/your-first-app/),
   "Side Loading an App"). On a Mac the watch's storage needs an MTP tool such as OpenMTP
   (not checked against Garmin's documentation).
3. Disconnect it. The app is in the watch's apps list as **WristMarkCompanion**.

The build is signed with a throwaway key, which is fine for sideloading.

### The viewer

Until it's deployed (milestone 5), it runs on studio, behind your sign-in:
**<https://8095-dawid.studio.ciepiela.org/>** (the `content-models` branch's image, container
`wristmark-viewer`). Open it on the phone, sign in, tap **Start the camera**, then **Debug**.
The overlay shows what the tables ask for.

To run it again or after a change, on studio:

```sh
docker build -t wristmark-viewer:test viewer
docker rm -f wristmark-viewer
docker run -d --name wristmark-viewer --restart unless-stopped -p 8095:8080 wristmark-viewer:test
```

A laptop can open the same address. Or run the image on the laptop itself and open
`http://localhost:8095`: browsers open the camera on `localhost` without HTTPS.

### Before you start

Measure the marker's black square on the watch with a ruler, and give it to the viewer as
`?size=` in millimeters, so that the distance is right:
`https://8095-dawid.studio.ciepiela.org/?size=18.6&debug`

| What                                         | Value |
|----------------------------------------------|-------|
| Date                                         |       |
| Watch, firmware version                      |       |
| wristmark commit (`git log -1 --oneline`)    |       |
| Marker's black square, measured (mm)         |       |
| Phone, model                                 |       |
| Phone browser and version                    |       |
| Laptop and webcam (if tested)                |       |
| Watch brightness setting                     |       |
| Watch display mode (always on, gesture, ...) |       |

## 1. Range

Hold the phone still at each distance, the watch facing the camera, for about 10 seconds, and
note what the overlay shows. "Measured" is the distance from the phone's camera to the watch
with a tape measure; "shown" is the overlay's `distance`. "Steady" is whether the model sits
still on the watch (yes, jitters, flips, lost).

Lighting: indoor lamp, indoor daylight, outdoor shade, outdoor sun; and with the watch in red
light (night mode), a dark room and an indoor lamp.

| Lighting      | Measured (cm) | Shown (mm) | Detection (%) | FPS | Detect time (ms) | Steady | Notes |
|---------------|---------------|------------|---------------|-----|------------------|--------|-------|
| indoor lamp   | 15            |            |               |     |                  |        |       |
| indoor lamp   | 30            |            |               |     |                  |        |       |
| indoor lamp   | 50            |            |               |     |                  |        |       |
| indoor lamp   | 75            |            |               |     |                  |        |       |
| indoor lamp   | 100           |            |               |     |                  |        |       |
| outdoor shade | 15            |            |               |     |                  |        |       |
| outdoor shade | 30            |            |               |     |                  |        |       |
| outdoor shade | 50            |            |               |     |                  |        |       |
| outdoor shade | 75            |            |               |     |                  |        |       |
| outdoor shade | 100           |            |               |     |                  |        |       |
| outdoor sun   | 30            |            |               |     |                  |        |       |
| outdoor sun   | 50            |            |               |     |                  |        |       |

**The farthest distance with at least 90 % detection:** \_\_\_ cm indoors, \_\_\_ cm outdoors.

## 2. Angle

At 30 cm, the watch turned away from the camera by about these angles.

| Angle (°) | Detection (%) | Steady | Notes |
|-----------|---------------|--------|-------|
| 0         |               |        |       |
| 30        |               |        |       |
| 45        |               |        |       |
| 60        |               |        |       |

## 3. Session length

Start the app, don't touch the watch, and time it. Then press a button and time the next
session. "Dims" is when the display gets darker; "off" is when the marker is no longer readable
by the viewer.

| Run | Started by     | Dims after (s) | Off after (s) | Marker still detected while dimmed? | After a press: on again? | Notes |
|-----|----------------|----------------|---------------|-------------------------------------|--------------------------|-------|
| 1   | opening app    |                |               |                                     |                          |       |
| 2   | a button press |                |               |                                     |                          |       |
| 3   | a button press |                |               |                                     |                          |       |
| 4   | auto-cycle on  |                |               |                                     |                          |       |

Battery before and after 10 minutes of the app (with presses to keep it on): \_\_\_ % → \_\_\_ %.

## 4. The models

On the phone, with markers 0 to 20 on the watch (its next and previous buttons). For the moon
and the globe, also: does the moon's phase match the sky, and is the day side of the Earth
where it's day now?

| ID  | Model                | Sits on the watch? | Smooth? | Notes |
|-----|----------------------|--------------------|---------|-------|
| 0   | Moon phase           |                    |         |       |
| 1   | Earth, day and night |                    |         |       |
| 2   | Robot                |                    |         |       |
| 3   | Tornado              |                    |         |       |
| 4   | Tyrannosaurus rex    |                    |         |       |
| 5   | Glimmer              |                    |         |       |
| 6   | Bee hive             |                    |         |       |
| 7   | Skate park           |                    |         |       |
| 8   | The planets today    |                    |         |       |
| 9   | Landing              |                    |         |       |
| 10  | Fireworks            |                    |         |       |
| 11  | World clock          |                    |         |       |
| 12  | Watch movement       |                    |         |       |
| 13  | Hourglass            |                    |         |       |
| 14  | Helicopter           |                    |         |       |
| 15  | Dice                 |                    |         |       |
| 16  | Campfire             |                    |         |       |
| 17  | Aquarium             |                    |         |       |
| 18  | Lighthouse           |                    |         |       |
| 19  | Hot-air balloon      |                    |         |       |
| 20  | Rocket launch        |                    |         |       |
| 21  | Attitude indicator   |                    |         |       |
| 22  | Marble maze          |                    |         |       |
| 23  | Tux                  |                    |         |       |
| 24  | Windmill             |                    |         |       |
| 25  | Sailboat             |                    |         |       |
| 26  | Ferris wheel         |                    |         |       |
| 27  | Bonsai               |                    |         |       |
| 28  | Atom                 |                    |         |       |
| 29  | DNA                  |                    |         |       |
| 30  | Newton's cradle      |                    |         |       |
| 31  | Metronome            |                    |         |       |
| 32  | Volcano              |                    |         |       |
| 33  | UFO                  |                    |         |       |
| 34  | Toy train            |                    |         |       |
| 35  | Gumball machine      |                    |         |       |
| 36  | Jellyfish            |                    |         |       |
| 37  | Butterflies          |                    |         |       |
| 38  | Carousel             |                    |         |       |
| 39  | Race track           |                    |         |       |
| 40  | Satellite            |                    |         |       |
| 41  | Sundial              |                    |         |       |
| 42  | Lava lamp            |                    |         |       |
| 43  | Castle               |                    |         |       |
| 44  | House                |                    |         |       |
| 45  | Snowman              |                    |         |       |
| 46  | Puzzle cube          |                    |         |       |
| 47  | Black hole           |                    |         |       |
| 48  | Treasure chest       |                    |         |       |
| 49  | Rain cloud           |                    |         |       |

## 5. Anything else

Whatever stood out: how holding the phone and the watch felt, what was annoying, ideas.

## What happens with the results

Each run's results and what came of them: [2026-11-17, a laptop's webcam](device-tests/2026-11-17-laptop.md).

They decide the next steps: whether js-aruco2 is fast enough or OpenCV.js is needed
([001](decisions/001-detection-library.md)), the detection resolution and smoothing, whether
the watch's layout should change, and how the display-on handling should behave.
