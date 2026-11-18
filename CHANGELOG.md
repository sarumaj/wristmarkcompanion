# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- The release bot writes each commit's subject as one line: their length isn't checked. -->
<!-- markdownlint-disable MD013 -->

## [Unreleased]

## 0.3.1 - 2026-11-18

### Fixed

- **viewer:** the markers and privacy pages' "Open the viewer" an icon on a narrow phone
- **ci:** the release's health check at the viewer's origin, and the changelog's long lines

## 0.3.0 - 2026-11-18

### Added

- **viewer:** the treasure chest, the rain cloud and the house rebuilt with more detail and life
- **android:** an App Bundle for Google Play, and the listing for Play and F-Droid
- the viewer's address set at build time (WRISTMARK_ORIGIN)
- **watch:** the Viewers screen shows the QR code of the viewer's address
- **watch:** a Viewers screen and a long touch open the pairing menu (#45)
- **watch:** the 129 devices whose Connect IQ can run the app, with their launcher icons
- **watch:** bike computers and handhelds too: every device with device apps
- **watch:** every wearable that can run it, not only the D2 Mach 1
- **app:** the viewer as an Android app, its signed APK on each release
- **viewer:** a steady pose for the wrist's gestures, the other hand's wave and swipe, and the debug view drawing what the tracking sees

### Fixed

- **android:** the app's license GPL-3.0-only, as the viewer's and the recipe's
- **watch:** devices.json without the extra blank line the log's copy had
- **watch:** wearables by their IDs, the API level also from deviceGroup: the SDK's deviceGroup is the API level, not a category
- **ci:** git-lfs in the checks job's image; the e2e job checks out without LFS

## 0.2.0 - 2026-11-17

### Added

- `compose.yaml`: the viewer with the control channel's relay, its nginx passing `/relay/` to it
  unbuffered (`RELAY=on`); the plain image keeps saying the relay is off. CI starts both and
  asks the relay's health through the viewer. Switching the app over is a step in the panel
  ([deployment](docs/dev/deployment.md#with-the-relay)).
- Pairing with the watch and steering it, end-to-end encrypted
  ([004](docs/dev/decisions/004-control-channel.md)): the viewer reads the watch's pairing code (13
  frames of four markers) through the camera, keeps the session in IndexedDB and sends the watch's
  commands (next, previous, cycle, buzz, disconnect); the watch app shows the code, keeps up to four
  viewers and polls the relay while open (written without the SDK, not compiled yet). Offered once
  the relay is deployed.
- The control channel's cryptography in the viewer (`js/channel.js`: HKDF-SHA256 keys from the
  watch's secret, AES-256-CBC with an HMAC-SHA256 tag, the replay and clock checks) and its test
  vectors (`protocol/channel-vectors.json`), made with Node's crypto, which the viewer matches
  byte for byte and the watch is to.
- The control channel's relay (`relay/`, [004](docs/dev/decisions/004-control-channel.md)): channels
  created by token hashes, a queue each way, the watch's long-poll over its channels, the viewer's
  event stream with resume, the limits, nothing logged; a 10 MB image that checks its own health.
  Not deployed yet.
- The phone's tilt for the attitude indicator, the maze and the penguin: a button switches on its
  motion sensors (`deviceorientation`), and gravity comes from them instead of the image's down.
  The Permissions-Policy allows the sensors for the viewer's origin; the privacy page says so.
- The model's size you choose is kept in the browser for your next visit; putting it back to
  normal forgets it. The privacy page says so.
- The last seven models (markers 43 to 49): a castle with a drawbridge, a house lit after dark, a
  snowman, a puzzle cube that scrambles and solves itself, a black hole, a treasure chest and a
  rain cloud with a rainbow. Every marker now has a model, and the watch shows all 50.
- A picture of every model in `docs/dev/content.md`'s table, rendered from the models themselves at
  a fixed date (`viewer/tools/render-models.mjs`); a test fails while a mapped model has none.
  They replace six strips that left out the placeholders, the lighthouse and the balloon.
  Snow and the fireworks' sparks are soft dots too.
- Seven more models (markers 36 to 42): a jellyfish, butterflies, a carousel, a race track, a
  satellite on the space station's orbit, a sundial reading the clock and a lava lamp, each set
  off by a tap.
- Eight more models (markers 28 to 35): an atom, DNA, a Newton's cradle, a metronome, a volcano,
  a UFO with a cow, a toy train and a birthday cake, each set off by a tap. Rising smoke, embers
  and bubbles are soft dots instead of squares.
- Seven more models (markers 21 to 27): an attitude indicator that stays level with the camera's
  image as the wrist turns, a marble maze tilted by the watch, a penguin keeping its balance, a
  windmill among tulips, a sailboat on the waves, a Ferris wheel lit after dark and a bonsai in
  today's season. Each reacts to a tap; the watch shows them too (`MarkerContent.mc`).
- Hand tracking, to try (`js/hands.js`, the hand button or `H`): MediaPipe's hand landmarker in
  the browser finds the hand not wearing the watch; pointing at the model taps it, a pinch on it
  grabs and turns it. Loaded from the viewer's own origin on first use; the CSP allows
  WebAssembly (`'wasm-unsafe-eval'`); the privacy page says so.
- One finger on the model (`js/touch.js`): a drag turns it about the watch and coasts on, the
  arrow keys too; a tap makes it hop and react: the dice roll, a planet says its name and
  distance, the fish dart off, the balloon's burner fires, the rocket counts down. Buttons do
  each tap.
- The brand where customers meet it: the logo as the icon in the browser and on the home screen,
  a web app manifest, a description and a social card for shared links, a README that starts with
  the product, a [user guide](docs/user/guide.md), and the store descriptions updated.
- Gestures of the wrist (`js/gestures.js`): a flick, a twist, a shake and a hold, from the
  smoothed pose. The dice, the snow globe, the robot, the fireworks, the campfire and the
  orrery react to them; the debug overlay shows the last one.
- Six more models (markers 15 to 20), from the time alone: dice rolling onto the watch, a
  campfire, an aquarium, a lighthouse, a hot-air balloon and a rocket launch. The watch shows
  them too (`MarkerContent.mc`).
- Four more models (markers 11 to 14), from the time alone: a world clock (the Earth from
  above the North Pole with eight cities' local times), an open watch movement whose hands
  show the time, an hourglass that runs out every minute, and a helicopter lifting off from a
  helipad on the watch.
- The guided device test (`?test`): `docs/dev/device-tests.md` step by step under the camera's
  image, spoken too, measuring detection, distance, tilt, jitter and flips, the display's
  dimming and switching off, and each model; red light (night mode) as a switch; a report
  in the protocol's tables.
- Three more models (markers 8 to 10): the planets around the sun as they stand today, from
  JPL's orbital elements; a plane landing on a runway on the watch; fireworks.
- Four models, all from the time alone, without a permission or the network: the moon
  in tonight's phase with the next full or new moon (marker 0), the Earth with day and night
  as they are now (1), a waving robot (2) and a snow globe (3). The placeholders move to 4-7.
  `?date=` shows the moon and the globe on another day.

### Changed

- Elements marked hidden stay hidden where a style sets their display (the action bar did not).
- After the first device test ([results](docs/dev/device-tests/2026-11-17-laptop.md)): the viewer
  detects once per camera frame, not at every display refresh (the FPS read 120 on a 30-frame
  camera); the detection's width grows toward the camera's own where it is fast, for range and
  for distances read true far away; a dimming noted before the marker was seen counts as 0 s.
- From a customer's view (a review, removed later): the status names the model and its
  hint and gives tips when the watch isn't found; errors say what to do; a Help dialog; buttons
  that do what the gestures do; keys; full screen; a camera switch; the marker page names the
  models; no accessibility violations left in axe's audit.
- The models are 2.5 times as large (`?scale=`), and pinching, the mouse wheel or a trackpad's
  pinch resize them; a double tap resets. Under a model, the watch's display is drawn black, so
  the model stands on a dark watch face instead of the marker.
- The watch shows only the markers the viewer has a model for (`MarkerContent.mc`, generated
  from `content.json` and checked by CI), so that every marker it shows brings up a model.
- The viewer's look: dark, with a start screen, the camera's image fitted to the screen in
  its own aspect, a status pill that shows searching or tracking, glass panels, and the same
  header, buttons and fields on every page. An error shows a card with *Try again*.
- The debug overlay: its numbers in a grid, colored by how good they are, and a chart of the
  last ten seconds of the detection rate and FPS.
- The device test: section cards with their progress, a progress bar per step, a countdown
  ring, and each measurement as tiles colored by how good it is.

### Fixed

- A release whose deployment fails shows the end of the panel's log in its job.

## 0.1.0 - 2026-11-16

### Added

- Repository layout, CI (viewer lint, image build and smoke test, marker table check), Renovate.
- The watch app compiled in CI with the Connect IQ SDK installed on the runner's host
  (`tools/build-watch.sh`), with the strict type check.
- The watch's launcher icon: marker 0, generated from the marker table.
- `tools/simulate.sh`: the watch app in the Connect IQ simulator, in a container, with a
  screenshot.
- The viewer's content: `content.json` maps marker IDs to models, checked on load; four
  placeholder models generated in code; an ID without content shows the gizmo.
- The viewer's debug overlay: ID, distance, FPS, detection rate and time, camera resolution.
- The device test protocol (`docs/dev/device-tests.md`): range, angle, session length, models.
- `tools/build-watch.sh` runs on macOS too, and builds the store package (`--package`).
- The release workflow: on a version tag, the store package, the viewer's files and the notes
  from this changelog on a Forgejo release, and the viewer deployed to
  `wristmark.apps.ciepiela.org`; the image's health check.
- The viewer's privacy page, in English and German, with `contact@ciepiela.org` as the contact.
- The app's name is WristMarkCompanion ("WristMark" is taken by an iPhone app), the
  repository `wristmarkcompanion`; the viewer's address stays `wristmark.apps.ciepiela.org`.
- The release bot's configuration (`.cz.toml`).
- The store guide (`docs/dev/publishing.md`) and the store icons; German declared in the manifest.
- Decisions: js-aruco2 for detection, OpenCV's DICT_4X4_50 as the marker dictionary.
- The watch's marker table, generated from js-aruco2's dictionary data.
- The viewer behind nginx, with a Content-Security-Policy that keeps every connection on its own
  origin: the rear camera, marker detection (DICT_4X4_50, one bit corrected), coplanar POSIT
  pose with flip-aware smoothing, and an axis gizmo drawn with three.js.
- A desktop page showing the watch's markers, for testing without a watch.
- End-to-end tests in Chromium: every marker detected, the pose's distance, and the viewer fed a
  marker through a fake camera.
- The watch app: the marker as large as the D2 Mach 1's round display allows
  with its quiet zone (about 18.6 mm), next and previous ID, an automatic cycle, and the display
  held on until the system's burn-in protection refuses.
