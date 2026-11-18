#!/usr/bin/env bash
# The Android app's APK and App Bundle (docs/dev/android.md): the viewer's files into
# app/www, Capacitor's sync into the Android project, and Gradle's build. The APK is for
# installing directly (the release's files, F-Droid); the bundle (.aab) is what Google Play
# takes (docs/dev/google-play.md). Needs Java 21, ANDROID_HOME (the
# SDK, tools/install-android-sdk.sh) and the viewer's node_modules (npm ci in viewer/).
#
#   tools/build-android.sh debug|release [output directory, default app/build]
#
# For release, APP_VERSION (X.Y.Z) sets the version, and ANDROID_KEYSTORE_FILE with
# ANDROID_KEYSTORE_PASSWORD sign both (docs/dev/android.md#signing); without them they're
# unsigned.
set -euo pipefail

variant=${1:?debug or release}
root=$(cd "$(dirname "$0")/.." && pwd)
out=${2:-$root/app/build}
: "${ANDROID_HOME:?ANDROID_HOME is the Android SDK (tools/install-android-sdk.sh)}"

cd "$root/app"
npm ci --no-audit --no-fund --ignore-scripts
"$root/tools/build-app-web.sh"
npx cap sync android
cd android
./gradlew --no-daemon --console=plain "assemble${variant^}" "bundle${variant^}"
mkdir -p "$out"
for file in app/build/outputs/apk/"$variant"/*.apk app/build/outputs/bundle/"$variant"/*.aab; do
  cp "$file" "$out/"
  echo "built $out/$(basename "$file")"
done
