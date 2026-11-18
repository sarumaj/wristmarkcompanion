#!/usr/bin/env bash
# The Android app's web files (app/www, docs/dev/android.md): the viewer's public/ and its
# libraries, as the viewer's Dockerfile assembles them for nginx, from the viewer's
# node_modules (npm ci in viewer/ first) and the hand model checked against
# hand-model.txt. Kept in viewer/node_modules/.cache between runs.
#
# The app reaches the relay at the homelab's deployment, or at WRISTMARK_ORIGIN's where
# that is set: the viewer's address the watch app is built for
# (docs/dev/watch.md#the-viewers-address).
#
# WRISTMARK_HANDS=off leaves hand tracking out: MediaPipe's WebAssembly and its model are
# prebuilt, which F-Droid's build refuses (docs/dev/android.md#f-droid). The page then gets
# a meta tag that hides the hand button.
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
hands=${WRISTMARK_HANDS:-on}
if [[ "$hands" != on && "$hands" != off ]]; then
  echo "WRISTMARK_HANDS must be on or off" >&2
  exit 1
fi
mkdir -p "$out/vendor/js-aruco2" "$out/vendor/three"
cp -r "$viewer/public/." "$out/"
cp -r "$modules/js-aruco2/src/." "$modules/js-aruco2/LICENSE.txt" "$out/vendor/js-aruco2/"
cp "$modules/three/build/three.module.js" "$modules/three/build/three.core.js" "$modules/three/LICENSE" "$out/vendor/three/"

if [[ -n "${WRISTMARK_ORIGIN:-}" ]]; then
  if [[ ! "$WRISTMARK_ORIGIN" =~ ^https://[a-z0-9.-]+(:[0-9]+)?$ ]]; then
    echo "WRISTMARK_ORIGIN must be https://<host>[:port], lower case, no path" >&2
    exit 1
  fi
  default="https://wristmark.apps.ciepiela.org/relay/v1"
  if ! grep -qF "\"$default\"" "$out/js/app.js"; then
    echo "js/app.js has no \"$default\" to replace with WRISTMARK_ORIGIN's relay" >&2
    exit 1
  fi
  sed -i "s|\"$default\"|\"$WRISTMARK_ORIGIN/relay/v1\"|" "$out/js/app.js"
fi

if [[ "$hands" == off ]]; then
  sed -i 's|<meta charset="utf-8">|<meta charset="utf-8">\n  <meta name="wristmark-hands" content="off">|' "$out/index.html"
  grep -q 'name="wristmark-hands"' "$out/index.html"
else
  mkdir -p "$out/vendor/mediapipe/wasm"
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
fi
echo "wrote app/www ($(du -sh "$out" | cut -f1))"
