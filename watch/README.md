# Watch app

The Connect IQ device app that shows the marker: [docs/watch.md](../docs/watch.md) describes its
layout, controls and how it keeps the display on.

| Path                         | What                                                                                                                                          |
|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `manifest.xml`               | App ID, type, target devices (`d2mach1`), API level, no permissions                                                                           |
| `monkey.jungle`              | Build settings (the default `source/` and `resources/`)                                                                                       |
| `source/WristmarkApp.mc`     | The app: the view and its controls                                                                                                            |
| `source/MarkerView.mc`       | Draws the marker, keeps the display on                                                                                                        |
| `source/MarkerDelegate.mc`   | Buttons and touch                                                                                                                             |
| `source/MarkerDictionary.mc` | The markers' codes, **generated** by `tools/generate-dictionary.mjs` ([decision 002](../docs/decisions/002-marker-dictionary.md)): don't edit |

Building it needs the Connect IQ SDK, which CI gets from the homelab's runner once it's set up
([docs/ci.md](../docs/ci.md)). Until then it is not compiled.
