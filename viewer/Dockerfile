# The viewer: its static files and the runtime libraries, copied out of
# node_modules (pinned in package-lock.json), behind nginx. No bundler.
FROM docker.io/library/node:24-alpine AS libraries
WORKDIR /viewer
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
RUN mkdir -p /vendor/js-aruco2 \
    && cp -r node_modules/js-aruco2/src/. node_modules/js-aruco2/LICENSE.txt /vendor/js-aruco2/

# The unprivileged image runs nginx as a non-root user on port 8080.
FROM docker.io/nginxinc/nginx-unprivileged:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
COPY --from=libraries /vendor/ /usr/share/nginx/html/vendor/
