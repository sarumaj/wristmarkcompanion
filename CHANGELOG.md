# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository layout, CI (viewer lint, image build and smoke test, marker table check), Renovate.
- The watch app compiled in CI with the Connect IQ SDK installed on the runner's host
  (`tools/build-watch.sh`), with the strict type check.
- The watch's launcher icon: marker 0, generated from the marker table.
- `tools/simulate.sh`: the watch app in the Connect IQ simulator, in a container, with a
  screenshot.
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
