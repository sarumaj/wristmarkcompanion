# The viewer: its static files and the runtime libraries, copied out of
# node_modules (pinned in package-lock.json), behind nginx. No bundler.
FROM docker.io/library/node:24-alpine AS libraries
WORKDIR /viewer
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
RUN mkdir -p /vendor/js-aruco2 /vendor/three /vendor/mediapipe/wasm \
    && cp -r node_modules/js-aruco2/src/. node_modules/js-aruco2/LICENSE.txt /vendor/js-aruco2/ \
    && cp node_modules/three/build/three.module.js node_modules/three/build/three.core.js \
       node_modules/three/LICENSE /vendor/three/ \
    && cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs /vendor/mediapipe/ \
    && cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js \
       node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm /vendor/mediapipe/wasm/
# The hand tracking's model, not on npm: Google's file at a fixed version, checked against
# its SHA-256 (hand-model.txt, which the tests use too).
COPY hand-model.txt ./
RUN read -r url sha256 < hand-model.txt \
    && wget -q -O /vendor/mediapipe/hand_landmarker.task "$url" \
    && echo "$sha256  /vendor/mediapipe/hand_landmarker.task" | sha256sum -c -

# The unprivileged image runs nginx as a non-root user on port 8080.
FROM docker.io/nginxinc/nginx-unprivileged:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
COPY --from=libraries /vendor/ /usr/share/nginx/html/vendor/

# Docker, and so the app host, see whether the viewer answers; busybox wget is in the
# image (tools/smoke-test.sh uses it too).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
