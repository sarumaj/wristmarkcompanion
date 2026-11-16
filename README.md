# WristMarkCompanion

AR on a phone or laptop screen, anchored to a Garmin watch. The watch shows an ArUco marker. A web
page in the browser finds it in the camera image (a phone's rear camera, or a laptop's webcam) and
draws a 3D model on top of the watch. Each marker ID shows a different model. There is no app to
install and no connection between the two: the marker ID is the only data channel, and the camera
images never leave the device.

Status: **milestone 4, waiting for the [device tests](docs/device-tests.md)**. The watch app
shows a marker on the D2 Mach 1 in the simulator, switching IDs with its buttons. The viewer
finds the marker in the camera image and draws the model `content.json` gives its ID (four
placeholders), with a debug overlay for the range tests. A desktop page shows the markers for
testing without a watch. Not yet tried on a real watch.

| Part      | Where                | What                                                                                                                                                                                                         |
|-----------|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Watch app | [`watch/`](watch/)   | Connect IQ device app (Monkey C), first target the D2 Mach 1                                                                                                                                                 |
| Viewer    | [`viewer/`](viewer/) | Static web app with js-aruco2 and three.js, served by nginx                                                                                                                                                  |
| Tools     | [`tools/`](tools/)   | The marker table and icon generators, the watch's build and simulator, smoke test                                                                                                                            |
| Docs      | [`docs/`](docs/)     | [Architecture](docs/architecture.md), [decisions](docs/decisions/), [content](docs/content.md), [watch](docs/watch.md), [CI](docs/ci.md), [deployment](docs/deployment.md), [publishing](docs/publishing.md) |

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
