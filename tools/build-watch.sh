#!/usr/bin/env bash
# Compiles the watch app for every device in watch/manifest.xml, with the Connect IQ
# SDK of the given version from the SDK manager's directory (docs/ci.md).
#
#   tools/build-watch.sh 9.3.0 [output directory, default watch/bin]
#
# CONNECTIQ_HOME is that directory, by default Linux's ~/.Garmin/ConnectIQ (macOS:
# "$HOME/Library/Application Support/Garmin/ConnectIQ"). monkeyc looks for the
# device files in the home's .Garmin/ConnectIQ (Linux), and Java takes the home
# from the account, not from $HOME. For another directory (CI's read-only
# /opt/connectiq) the script gives Java a home of its own whose .Garmin/ConnectIQ
# links to it. monkeyc also creates a default.jungle in the SDK's bin ("Unable
# to generate default.jungle: Read-only file system"), so the directories on
# that path are real ones holding links to the files. Each build is signed with a
# throwaway key made here and deleted afterwards: these builds are for testing,
# never released (release signing: milestone 5).
set -euo pipefail

version=${1:?usage: tools/build-watch.sh <sdk-version> [output directory]}
out=${2:-watch/bin}
home=${CONNECTIQ_HOME:-$HOME/.Garmin/ConnectIQ}

shopt -s nullglob
sdks=("$home"/Sdks/connectiq-sdk-*-"$version"-*/)
if (( ${#sdks[@]} != 1 )); then
  echo "error: expected one SDK $version in $home/Sdks, found ${#sdks[@]}" >&2
  exit 1
fi
sdk=${sdks[0]%/}

mapfile -t devices < <(sed -n 's/.*<iq:product id="\([^"]*\)".*/\1/p' watch/manifest.xml)
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
if [[ -n "${CONNECTIQ_HOME:-}" ]]; then
  writable=$keys/home/.Garmin/ConnectIQ
  shadow "$home" "$writable"
  rm "$writable/Sdks"
  shadow "$home/Sdks" "$writable/Sdks"
  rm "$writable/Sdks/${sdk##*/}"
  shadow "$sdk" "$writable/Sdks/${sdk##*/}"
  rm "$writable/Sdks/${sdk##*/}/bin"
  # Java creates default.jungle next to the real path of monkeybrains.jar, so
  # the jar is a copy (23 MB), not a link.
  bin=$writable/Sdks/${sdk##*/}/bin
  shadow "$sdk/bin" "$bin"
  cp --remove-destination "$sdk/bin/monkeybrains.jar" "$bin/"
  home=$writable
  sdk=$writable/Sdks/${sdk##*/}
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Duser.home=$keys/home"
fi
monkeyc=$sdk/bin/monkeyc

openssl genrsa -out "$keys/key.pem" 4096 2>/dev/null
openssl pkcs8 -topk8 -inform PEM -outform DER -in "$keys/key.pem" -out "$keys/key.der" -nocrypt

mkdir -p "$out"
"$monkeyc" --version
for device in "${devices[@]}"; do
  if [[ ! -d "$home/Devices/$device" ]]; then
    echo "error: no device files for $device in $home/Devices (connectiq-update)" >&2
    exit 1
  fi
  echo "== $device"
  "$monkeyc" --warn --typecheck 3 --device "$device" --jungles watch/monkey.jungle \
    --private-key "$keys/key.der" --output "$out/wristmark-$device.prg"
done
