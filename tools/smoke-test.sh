#!/bin/sh
# Smoke test of the viewer image: starts it, then checks from inside the
# container (busybox wget; CI jobs cannot reach published ports) that the
# health check, the page, the libraries, the content mapping and the privacy
# headers are served.
#
#   tools/smoke-test.sh <image>
set -eu

image=${1:?usage: tools/smoke-test.sh <image>}
name="wristmark-smoke-$$"

docker run -d --name "$name" "$image" > /dev/null
trap 'docker rm -f "$name" > /dev/null' EXIT

fetch() {
    docker exec "$name" wget -q -O - "http://127.0.0.1:8080$1"
}

fail() {
    echo "smoke test failed: $1" >&2
    docker logs "$name" >&2 || true
    exit 1
}

tries=0
until [ "$(fetch /healthz 2> /dev/null)" = "ok" ]; do
    tries=$((tries + 1))
    [ "$tries" -lt 20 ] || fail "/healthz did not answer ok within 10 seconds"
    sleep 0.5
done

fetch / | grep -q "<title>wristmark viewer</title>" || fail "/ is not the viewer's page"
fetch /vendor/js-aruco2/aruco.js | grep -q "AR.Detector" || fail "js-aruco2 is not served"
fetch /vendor/js-aruco2/dictionaries/aruco_4x4_1000.js | grep -q "ARUCO_4X4_1000" \
    || fail "the 4x4 dictionary is not served"
fetch /vendor/three/three.module.js | grep -q "three.core.js" || fail "three.js is not served"
fetch /vendor/three/three.core.js | grep -q "REVISION" || fail "three.js's core is not served"
fetch /markers.html | grep -q "<title>wristmark markers</title>" || fail "the marker page is not served"
fetch /js/app.js | grep -q "MarkerTracker" || fail "the viewer's code is not served"
fetch /js/models.js | grep -q "createModel" || fail "the models are not served"
fetch /content.json | grep -q '"markers"' || fail "content.json is not served"
docker exec "$name" wget -q -S -O /dev/null http://127.0.0.1:8080/content.json 2>&1 \
    | grep -q "Content-Type: application/json" || fail "content.json is not served as JSON"

headers=$(docker exec "$name" wget -q -S -O /dev/null http://127.0.0.1:8080/ 2>&1)
echo "$headers" | grep -q "Content-Security-Policy: .*connect-src 'self'" \
    || fail "the Content-Security-Policy does not limit connections to the origin"
echo "$headers" | grep -q "Permissions-Policy: camera=(self)" || fail "no Permissions-Policy for the camera"

if docker exec "$name" wget -q -O /dev/null http://127.0.0.1:8080/missing 2> /dev/null; then
    fail "a missing file did not answer 404"
fi

echo "smoke test passed: $image"
