# wristmark

AR on a phone screen, anchored to a Garmin watch. The watch shows an ArUco marker. A web page in
the phone's browser finds it in the camera image and draws a 3D model on top of the watch. Each
marker ID shows a different model. There is no phone app and no connection between the two: the
marker ID is the only data channel, and the camera images never leave the phone.

Status: **milestone 1**. The repository, CI and the decisions are in place; the watch app and
the viewer are not built yet.

| Part | Where | What |
|---|---|---|
| Watch app | [`watch/`](watch/) | Connect IQ device app (Monkey C), first target the D2 Mach 1 |
| Viewer | [`viewer/`](viewer/) | Static web app with js-aruco2 and three.js, served by nginx |
| Tools | [`tools/`](tools/) | The marker table generator, the image's smoke test |
| Docs | [`docs/`](docs/) | [Architecture](docs/architecture.md), [decisions](docs/decisions/), [CI](docs/ci.md) |

## Development

```sh
npm ci --prefix viewer                        # the viewer's pinned libraries and lint tools
npm run --prefix viewer lint
node tools/generate-dictionary.mjs            # rewrite the watch's marker table
docker build -t wristmark-viewer:test viewer && tools/smoke-test.sh wristmark-viewer:test
```

## License

GPL-3.0 ([`LICENSE`](LICENSE)). Third-party parts keep their own licenses: js-aruco2 (MIT) and
the OpenCV ArUco dictionary (3-clause BSD, its notice is in
`watch/source/MarkerDictionary.mc`).
