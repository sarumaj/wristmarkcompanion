# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The guided device test (`?test`): `docs/device-tests.md` step by step under the camera's
  image, spoken too, measuring detection, distance, tilt, jitter and flips, the display's
  dimming and switching off, and each model; red light (night mode) as a switch; a report
  in the protocol's tables.
- Three more models (markers 8 to 10): the planets around the sun as they stand today, from
  JPL's orbital elements; a plane landing on a runway on the watch; fireworks.
- Four models, all from the time alone, without a permission or the network: the moon
  in tonight's phase with the next full or new moon (marker 0), the Earth with day and night
  as they are now (1), a waving robot (2) and a snow globe (3). The placeholders move to 4-7.
  `?date=` shows the moon and the globe on another day.

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
- The device test protocol (`docs/device-tests.md`): range, angle, session length, models.
- `tools/build-watch.sh` runs on macOS too, and builds the store package (`--package`).
- The release workflow: on a version tag, the store package, the viewer's files and the notes
  from this changelog on a Forgejo release, and the viewer deployed to
  `wristmark.apps.ciepiela.org`; the image's health check.
- The viewer's privacy page, in English and German, with `contact@ciepiela.org` as the contact.
- The app's name is WristMarkCompanion ("WristMark" is taken by an iPhone app), the
  repository `wristmarkcompanion`; the viewer's address stays `wristmark.apps.ciepiela.org`.
- The release bot's configuration (`.cz.toml`).
- The store guide (`docs/publishing.md`) and the store icons; German declared in the manifest.
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
