#!/usr/bin/env bash
# The Android app's web files (app/www, docs/android.md): the viewer's public/ and its
# libraries, as the viewer's Dockerfile assembles them for nginx, from the viewer's
# node_modules (npm ci in viewer/ first) and the hand model checked against
# hand-model.txt. Kept in viewer/node_modules/.cache between runs.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
viewer="$root/viewer"
modules="$viewer/node_modules"
out="$root/app/www"

if [[ ! -d "$modules/three" ]]; then
  echo "viewer/node_modules is missing: run npm ci in viewer/ first" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out/vendor/js-aruco2" "$out/vendor/three" "$out/vendor/mediapipe/wasm"
cp -r "$viewer/public/." "$out/"
cp -r "$modules/js-aruco2/src/." "$modules/js-aruco2/LICENSE.txt" "$out/vendor/js-aruco2/"
cp "$modules/three/build/three.module.js" "$modules/three/build/three.core.js" "$modules/three/LICENSE" "$out/vendor/three/"
cp "$modules/@mediapipe/tasks-vision/vision_bundle.mjs" "$out/vendor/mediapipe/"
cp "$modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js" \
  "$modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm" "$out/vendor/mediapipe/wasm/"

read -r url sha256 < "$viewer/hand-model.txt"
model="$modules/.cache/hand_landmarker.task"
if [[ ! -f "$model" ]] || ! echo "$sha256  $model" | sha256sum -c - > /dev/null 2>&1; then
  mkdir -p "$(dirname "$model")"
  curl -fsSL -o "$model" "$url"
  echo "$sha256  $model" | sha256sum -c - > /dev/null
fi
cp "$model" "$out/vendor/mediapipe/hand_landmarker.task"
echo "wrote app/www ($(du -sh "$out" | cut -f1))"
