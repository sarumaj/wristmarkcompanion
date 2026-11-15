# 001: Detection library: js-aruco2

Status: accepted (milestone 1), to be revisited after the device tests (milestone 4).

## Question

The viewer detects an ArUco marker in the phone's camera image and estimates its pose. The two
candidates were [js-aruco2](https://github.com/damianofalcioni/js-aruco2) and OpenCV.js.

## Comparison

Checked on 2026-11-15 against the packages from npm.

| Criterion | js-aruco2 2.0.0 | OpenCV.js (`@techstark/opencv-js` 5.0.0-release.1) |
|---|---|---|
| Download | 78 KB of JavaScript for the detector and pose (`aruco.js`, `cv.js`, `posit1.js`, `posit2.js`, `svd.js`), plus 11 KB for the 4x4 dictionary, uncompressed | One 13.3 MB `opencv.js` (WebAssembly embedded), 3.7 MB gzipped |
| License | MIT (js-aruco2); its dictionaries carry OpenCV's 3-clause BSD license | Apache-2.0 |
| GPL-3.0 compatible | Yes (MIT, BSD-3) | Yes (Apache-2.0 is compatible with GPL-3.0) |
| ArUco detection | `AR.Detector` with OpenCV's dictionaries, including `ARUCO_4X4_1000` | Not confirmed in this build: its type definitions declare no `ArucoDetector`. A custom Emscripten build might be needed, which is a build toolchain this project otherwise avoids |
| Pose | Coplanar POSIT (`posit1.js`, Oberkampf, DeMenthon and Davis), which returns the best pose and the alternative one | `solvePnP` (needs camera intrinsics, as POSIT does) |
| Start-up | Plain scripts, nothing to compile | Has to download and instantiate 13 MB before the first frame |
| Speed on a mid-range Android phone | **Not measured yet** | **Not measured yet** |
| Last release | 2025-06-19 | 2026-06-24 |

## Decision

js-aruco2. It is about 150 times smaller, needs no build step, and ships exactly the OpenCV
dictionary the watch draws ([002](002-marker-dictionary.md)). Its pose returns both solutions of
the planar ambiguity, which the temporal smoothing needs to pick the stable one.

## What this means for the viewer

- **Error correction has to be set explicitly.** js-aruco2 computes its tolerance (`tau`) as the
  smallest distance between codes, without their rotations (`AR.Dictionary._calculateTau`), and
  accepts a code closer than that. On a 50-code subset this would accept several wrong bits.
  The viewer sets `maxHammingDistance: 2`, which accepts one wrong bit, as OpenCV's
  `DICT_4X4_50` does (`maxCorrectionBits` 1).
- **Pinned and served as files:** the Dockerfile copies `node_modules/js-aruco2/src` to
  `/vendor/js-aruco2/` with its license. Renovate updates the version in `viewer/package.json`.

## When to revisit

If the device tests show fewer than about 15 detections per second on the test phone at the
camera resolution needed for the range target, OpenCV.js (or a custom build of it) is the
fallback. Speed is the open question this decision does not answer.
