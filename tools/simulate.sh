#!/usr/bin/env bash
# Runs a built watch app in the Connect IQ simulator, in a container with a virtual
# display, and saves a screenshot of the simulator's window.
#
#   tools/simulate.sh 9.3.0 d2mach1 watch/bin/wristmark-d2mach1.prg out.png
#
# CONNECTIQ_HOME is the SDK manager's directory (default ~/.Garmin/ConnectIQ), with
# the SDK, the device and its Fonts (connectiq-update fetches them). It's mounted
# read-only. Needs Docker. The screenshot shows Garmin's picture of the watch around
# the display, which is part of the SDK: don't publish it uncropped.
set -euo pipefail

version=${1:?usage: tools/simulate.sh <sdk-version> <device> <prg> <png>}
device=${2:?usage: tools/simulate.sh <sdk-version> <device> <prg> <png>}
prg=${3:?usage: tools/simulate.sh <sdk-version> <device> <prg> <png>}
png=${4:?usage: tools/simulate.sh <sdk-version> <device> <prg> <png>}
home=${CONNECTIQ_HOME:-$HOME/.Garmin/ConnectIQ}

shopt -s nullglob
sdks=("$home"/Sdks/connectiq-sdk-lin-"$version"-*/)
if (( ${#sdks[@]} != 1 )); then
  echo "error: expected one Linux SDK $version in $home/Sdks, found ${#sdks[@]}" >&2
  exit 1
fi
for need in "Devices/$device" Fonts; do
  if [[ ! -d "$home/$need" ]]; then
    echo "error: no $home/$need (connectiq-update fetches it)" >&2
    exit 1
  fi
done
[[ -f "$prg" ]] || { echo "error: no $prg (tools/build-watch.sh builds it)" >&2; exit 1; }

image=wristmark-simulator
docker build -q -t "$image" "$(dirname "$0")/simulator" >/dev/null
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cp "$prg" "$out/app.prg"

# The simulator takes a while to start; monkeydo connects to it when it's ready.
docker run --rm -v "$home:/root/.Garmin/ConnectIQ:ro" -v "$out:/work" \
  -e SDK="/root/.Garmin/ConnectIQ/Sdks/${sdks[0]#"$home"/Sdks/}" -e DEVICE="$device" "$image" bash -c '
    set -euo pipefail
    Xvfb :99 -screen 0 1280x1024x24 >/dev/null 2>&1 &
    export DISPLAY=:99
    sleep 2
    "$SDK/bin/simulator" >/work/simulator.log 2>&1 &
    sleep 15
    timeout 60 "$SDK/bin/monkeydo" /work/app.prg "$DEVICE" >/work/monkeydo.log 2>&1 &
    sleep 25
    import -window root /work/screen.png
    if grep -q -i "error\|crash" /work/monkeydo.log; then
      cat /work/monkeydo.log >&2
      exit 1
    fi'
cp "$out/screen.png" "$png"
echo "wrote $png"
