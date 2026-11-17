#!/usr/bin/env bash
# The Android SDK's parts the app's build needs (docs/android.md), into $1 (ANDROID_HOME):
# Google's command-line tools at a pinned version, checked against their SHA-256 (its
# SHA-1 matches Google's repository manifest, repository2-3.xml), then the platform and
# build tools through sdkmanager, its licenses accepted. Needs Java 17 or later.
#
#   tools/install-android-sdk.sh "$HOME/.cache/android/sdk"
set -euo pipefail

home=${1:?the directory of the SDK (ANDROID_HOME)}
tools=16111833
sha256=0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8
# What app/android/variables.gradle compiles against, and the Android Gradle plugin's
# build tools.
packages=("platforms;android-36" "build-tools;35.0.0")

mkdir -p "$home"
if [[ ! -x "$home/cmdline-tools/latest/bin/sdkmanager" ]]; then
  zip="$home/commandlinetools-$tools.zip"
  if [[ ! -f "$zip" ]] || ! echo "$sha256  $zip" | sha256sum -c - > /dev/null 2>&1; then
    curl -fsSL -o "$zip" "https://dl.google.com/android/repository/commandlinetools-linux-${tools}_latest.zip"
    echo "$sha256  $zip" | sha256sum -c -
  fi
  rm -rf "$home/cmdline-tools"
  mkdir -p "$home/cmdline-tools"
  unzip -q "$zip" -d "$home/cmdline-tools"
  mv "$home/cmdline-tools/cmdline-tools" "$home/cmdline-tools/latest"
fi
sdkmanager="$home/cmdline-tools/latest/bin/sdkmanager"
# Licenses: older tools ask, newer ones accept them with the install. `yes` ends on the
# pipe's close, which pipefail would take for a failure.
{ yes 2> /dev/null || true; } | "$sdkmanager" --sdk_root="$home" --licenses > /dev/null 2>&1 || true
{ yes 2> /dev/null || true; } | "$sdkmanager" --sdk_root="$home" "${packages[@]}" > /dev/null
echo "Android SDK in $home: ${packages[*]}"
