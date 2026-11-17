# Watch app

The Connect IQ device app that shows the marker: [docs/watch.md](../docs/watch.md) describes its
layout, controls and how it keeps the display on.

| Path                                                           | What                                                                                                                                          |
|----------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `manifest.xml`                                                 | App ID, type, target devices (`d2mach1`), API level, the Communications permission                                                            |
| `monkey.jungle`                                                | Build settings (the default `source/` and `resources/`)                                                                                       |
| `source/WristmarkApp.mc`                                       | The app: the view and its controls                                                                                                            |
| `source/MarkerView.mc`                                         | Draws the marker, keeps the display on                                                                                                        |
| `source/MarkerDelegate.mc`                                     | Buttons and touch                                                                                                                             |
| `source/MarkerDraw.mc`                                         | Draws a marker of the dictionary: the single one, and the four of a pairing frame                                                             |
| `source/PairingView.mc`                                        | The pairing code: the secret's 13 frames of four markers ([004](../docs/decisions/004-control-channel.md))                                    |
| `source/ViewersMenu.mc`                                        | The menu: pair a viewer, forget one or all                                                                                                    |
| `source/Link.mc`                                               | The control channel: the long-poll to the relay through the phone, sending the watch's state                                                  |
| `source/Sessions.mc`                                           | The paired viewers in `Application.Storage`, at most four, expiring                                                                           |
| `source/ChannelCrypto.mc`, `Bytes.mc`, `Json.mc`, `Pairing.mc` | HKDF, the envelopes (AES-256-CBC, HMAC-SHA256), bytes and texts, the messages' JSON, the frames                                               |
| `source/ChannelTest.mc`                                        | Unit tests against the test vectors (`monkeyc --unit-test`)                                                                                   |
| `source/ChannelVectors.mc`                                     | The test vectors, **generated** by `tools/generate-channel-vectors.mjs`: don't edit                                                           |
| `source/MarkerDictionary.mc`                                   | The markers' codes, **generated** by `tools/generate-dictionary.mjs` ([decision 002](../docs/decisions/002-marker-dictionary.md)): don't edit |

Building it needs the Connect IQ SDK, which CI gets from the homelab's runner once it's set up
([docs/ci.md](../docs/ci.md)). Until then it is not compiled. **The control channel's code
(pairing, the link, the crypto) was written without the SDK at hand and has never been
compiled**: the first build and `ChannelTest.mc` in the simulator are its first check.
