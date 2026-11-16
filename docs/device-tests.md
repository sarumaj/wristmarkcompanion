# Device tests

Status: **to be filled in by the owner** (milestone 4). Optimizing waits for these results.

The prototype has two open questions:

1. **Range:** at what distance does tracking stay reliable with the D2 Mach 1's marker (about
   18.6 mm, [watch](watch.md#layout))?
2. **Session length:** how long does the watch keep the marker visible before the display
   dims or turns off ([watch](watch.md#keeping-the-display-on))?

Fill in the tables below, as many rows as you get to. A `-` is fine where something wasn't
measured; notes are welcome anywhere.

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

Lighting: indoor lamp, indoor daylight, outdoor shade, outdoor sun.

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

On the phone, with markers 0 to 3 on the watch (its next and previous buttons):

| ID  | Model      | Sits on the watch? | Smooth? | Notes |
|-----|------------|--------------------|---------|-------|
| 0   | Cube       |                    |         |       |
| 1   | Torus knot |                    |         |       |
| 2   | Planet     |                    |         |       |
| 3   | Crystal    |                    |         |       |

## 5. Anything else

Whatever stood out: how holding the phone and the watch felt, what was annoying, ideas.

## What happens with the results

They decide the next steps: whether js-aruco2 is fast enough or OpenCV.js is needed
([001](decisions/001-detection-library.md)), the detection resolution and smoothing, whether
the watch's layout should change, and how the display-on handling should behave.
