#!/usr/bin/env bash
# Compiles the watch app for every device in watch/manifest.xml, with the Connect IQ
# SDK of the given version from the SDK manager's directory (docs/ci.md): a test
# package of all of them (wristmark-test.iq, one compiler run), and a .prg to sideload
# or simulate for the D2 Mach 1 or the devices WATCH_DEVICES names.
#
#   tools/build-watch.sh 9.3.0 [output directory, default watch/bin]
#   WATCH_DEVICES="fenix847mm venu3" tools/build-watch.sh 9.3.0
#
# CONNECTIQ_HOME is that directory, by default Linux's ~/.Garmin/ConnectIQ (macOS:
# "$HOME/Library/Application Support/Garmin/ConnectIQ"). On Linux monkeyc looks for
# the device files in the home's .Garmin/ConnectIQ, and Java takes the home from
# the account, not from $HOME, so for another directory (CI's /opt/connectiq) the
# script gives Java a home of its own. Where the SDK is read-only, monkeyc can't
# create its default.jungle ("Unable to generate default.jungle: Read-only file
# system"), so the script builds writable directories of links over it. Each test build
# is signed with a throwaway key made here and deleted afterwards: these builds are
# for testing, never released (the store package: --package below).
#
#   CONNECTIQ_KEY=developer_key.der tools/build-watch.sh --package 9.3.0 [output directory]
#
# --package builds the store package instead (wristmark.iq: every device of the
# manifest, without debug information), signed with the developer key whose DER
# file CONNECTIQ_KEY names: the same key for every release, or the store refuses
# the update (Garmin's Getting Started: "If you lose your original signing key
# you will not be able to update your app").
set -euo pipefail

package=false
if [[ "${1:-}" == --package ]]; then
  package=true
  shift
  if [[ -z "${CONNECTIQ_KEY:-}" || ! -f "$CONNECTIQ_KEY" ]]; then
    echo "error: --package needs CONNECTIQ_KEY, the developer key's DER file" >&2
    exit 1
  fi
fi
version=${1:?usage: tools/build-watch.sh [--package] <sdk-version> [output directory]}
out=${2:-watch/bin}
# The devices a test build makes a .prg for, to sideload or simulate: the D2 Mach 1, or
# those WATCH_DEVICES names (space-separated). Every device of the manifest is compiled
# and type-checked anyway, in the test package (wristmark-test.iq).
read -r -a prg_devices <<< "${WATCH_DEVICES:-d2mach1}"
# The manifest's jungle and the devices' (each one's launcher icon, generate-devices.mjs).
jungles="watch/monkey.jungle;watch/devices.jungle"
home=${CONNECTIQ_HOME:-$HOME/.Garmin/ConnectIQ}

shopt -s nullglob
sdks=("$home"/Sdks/connectiq-sdk-*-"$version"-*/)
if (( ${#sdks[@]} != 1 )); then
  echo "error: expected one SDK $version in $home/Sdks, found ${#sdks[@]}" >&2
  exit 1
fi
sdk=${sdks[0]%/}

# A loop, not mapfile: macOS ships bash 3.2.
devices=()
while IFS= read -r device; do
  devices+=("$device")
done < <(sed -n 's/.*<iq:product id="\([^"]*\)".*/\1/p' watch/manifest.xml)
if (( ${#devices[@]} == 0 )); then
  echo "error: no <iq:product> in watch/manifest.xml" >&2
  exit 1
fi

keys=$(mktemp -d)
trap 'rm -rf "$keys"' EXIT

# A writable directory at $2 with links to everything in $1.
shadow() {
  mkdir -p "$2"
  for entry in "$1"/*; do ln -s "$entry" "$2/"; done
}
# Linux with another directory than ~/.Garmin/ConnectIQ: Java's home is redirected
# to one whose .Garmin/ConnectIQ is that directory. macOS's SDK finds its devices
# itself.
if [[ -n "${CONNECTIQ_HOME:-}" && "$(uname)" == Linux ]]; then
  writable=$keys/home/.Garmin/ConnectIQ
  if [[ -w "$sdk/bin" ]]; then
    mkdir -p "${writable%/*}"
    ln -s "$home" "$writable"
  else
    # Read-only (CI's mount): real directories holding links down to the SDK's bin,
    # and the jar a copy, since Java creates default.jungle next to its real path.
    shadow "$home" "$writable"
    rm "$writable/Sdks"
    shadow "$home/Sdks" "$writable/Sdks"
    rm "$writable/Sdks/${sdk##*/}"
    shadow "$sdk" "$writable/Sdks/${sdk##*/}"
    rm "$writable/Sdks/${sdk##*/}/bin"
    bin=$writable/Sdks/${sdk##*/}/bin
    shadow "$sdk/bin" "$bin"
    rm "$bin/monkeybrains.jar"
    cp "$sdk/bin/monkeybrains.jar" "$bin/"
    home=$writable
    sdk=$writable/Sdks/${sdk##*/}
  fi
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Duser.home=$keys/home"
fi
monkeyc=$sdk/bin/monkeyc

mkdir -p "$out"
"$monkeyc" --version
for device in "${devices[@]}"; do
  if [[ ! -d "$home/Devices/$device" ]]; then
    echo "error: no device files for $device in $home/Devices (connectiq-update)" >&2
    exit 1
  fi
done

if $package; then
  "$monkeyc" --package-app --release --warn --typecheck 3 --jungles "$jungles" \
    --private-key "$CONNECTIQ_KEY" --output "$out/wristmark.iq"
  exit 0
fi

openssl genrsa -out "$keys/key.pem" 4096 2>/dev/null
openssl pkcs8 -topk8 -inform PEM -outform DER -in "$keys/key.pem" -out "$keys/key.der" -nocrypt

# Every device at once, in one compiler run (one Java start, not one per device).
echo "== all ${#devices[@]} devices"
"$monkeyc" --package-app --warn --typecheck 3 --jungles "$jungles" \
  --private-key "$keys/key.der" --output "$out/wristmark-test.iq"
for device in "${prg_devices[@]}"; do
  echo "== $device"
  "$monkeyc" --warn --typecheck 3 --device "$device" --jungles "$jungles" \
    --private-key "$keys/key.der" --output "$out/wristmark-$device.prg"
done
