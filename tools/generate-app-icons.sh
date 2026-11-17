#!/usr/bin/env bash
# The Android app's launcher icons and splash screens (app/android/app/src/main/res), from
# the viewer's icons (viewer/public/icons): the adaptive icon's foreground from the
# maskable one (its gradient fills the layer; the launcher's mask cuts it), the older
# launchers' icon from icon-512, and the splash: the icon on the viewer's dark background.
# Needs libvips (vips). Run after changing the viewer's icons; the output is committed.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
icons="$root/viewer/public/icons"
res="$root/app/android/app/src/main/res"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Density, legacy icon size, adaptive layer size (108 dp).
while read -r density icon layer; do
  vips thumbnail "$icons/icon-512.png" "$res/mipmap-$density/ic_launcher.png" "$icon"
  cp "$res/mipmap-$density/ic_launcher.png" "$res/mipmap-$density/ic_launcher_round.png"
  vips thumbnail "$icons/maskable-512.png" "$res/mipmap-$density/ic_launcher_foreground.png" "$layer"
done <<'SIZES'
mdpi 48 108
hdpi 72 162
xhdpi 96 216
xxhdpi 144 324
xxxhdpi 192 432
SIZES

# The splash images, each the size Capacitor's template has: the icon at a quarter of the
# shorter side, centered on the stage's dark (#07090d).
while IFS= read -r -d '' file; do
  width=$(vipsheader -f width "$file")
  height=$(vipsheader -f height "$file")
  side=$(( (width < height ? width : height) / 4 ))
  vips thumbnail "$icons/icon-512.png" "$tmp/icon.png" "$side"
  vips flatten "$tmp/icon.png" "$tmp/flat.png" --background "7 9 13"
  vips embed "$tmp/flat.png" "$file" $(( (width - side) / 2 )) $(( (height - side) / 2 )) "$width" "$height" \
    --extend background --background "7 9 13"
done < <(find "$res" -name splash.png -print0)
echo "wrote the launcher icons and splash screens in app/android/app/src/main/res"
