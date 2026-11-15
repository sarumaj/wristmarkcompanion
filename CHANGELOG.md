# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository layout, CI (viewer lint, image build and smoke test, marker table check), Renovate.
- Decisions: js-aruco2 for detection, OpenCV's DICT_4X4_50 as the marker dictionary.
- The watch's marker table, generated from js-aruco2's dictionary data.
- A placeholder viewer page behind nginx, with a Content-Security-Policy that keeps every
  connection on its own origin.
