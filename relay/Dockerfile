# The relay of the control channel (docs/dev/decisions/004-control-channel.md): a static
# binary in an empty image, run as nobody.
FROM docker.io/library/golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /relay .

FROM scratch
COPY --from=build /relay /relay
USER 65534:65534
EXPOSE 8081
# The image has no shell: the binary asks its own health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["/relay", "-check"]
ENTRYPOINT ["/relay"]
