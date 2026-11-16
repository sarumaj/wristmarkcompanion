# The Connect IQ simulator's runtime, for tools/simulate.sh. The SDK itself is
# mounted, never copied into the image (its license, docs/ci.md). Ubuntu 22.04:
# the simulator links WebKitGTK 4.0, which 24.04 no longer ships.
FROM docker.io/library/ubuntu:22.04
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.0-37 libsecret-1-0 libusb-1.0-0 libxxf86vm1 libsm6 libgtk-3-0 \
    openjdk-17-jre-headless xvfb imagemagick fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
