# Review from a customer's view

Status: **2026-11-16**, the viewer with its 21 models and the gestures. What someone who has
never heard of WristMarkCompanion meets, from the first visit on: usability, the interface,
accessibility, the documentation and the brand. Each finding says what was done about it.

## How it was reviewed

- **A first visit, played through** on a 390 by 844 phone and a 1280 by 800 laptop, through
  Chromium's fake camera with a watch drawn in its real proportions, tilted as on a wrist.
- **An accessibility audit** with [axe-core](https://github.com/dequelabs/axe-core) 4 on every page
  and state (start, tracking, debug, help, error, the device test, the marker and privacy pages),
  in the dark and the light scheme.
- **The keyboard alone**, and the status line as a screen reader would announce it.

## Findings

| #   | Finding                                                                                                                      | Weight   | Done                                                                                                                                             |
|-----|------------------------------------------------------------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| 1   | The status spoke like a developer ("Marker 15 (Dice), 176 mm away"), and changed every frame, so a screen reader repeated it | High     | It names the model and its hint ("Dice · Flick or shake your wrist to roll"), changes only when its text does; the distance is in the debug view |
| 2   | Nothing helped when the watch wasn't found: "Looking for a marker…" for ever                                                 | High     | After 6 seconds it says how: 20 to 50 cm away, the display toward the camera, in good light                                                      |
| 3   | The browser's own errors ("Requested device not found")                                                                      | High     | What to do, per cause (declined, no camera, camera busy, not HTTPS, an old browser); the browser's message small below, for support              |
| 4   | Nothing said that the wrist's gestures or pinching existed                                                                   | High     | Each model's hint in the status; a **Help** dialog (also `?`) with the steps, tips, the gestures and the keys                                    |
| 5   | A gesture was the only way to a model's action: not for someone who can't move the wrist, or has both hands busy             | High     | Buttons under the model that do the same (Roll, Shake, Wave, Launch, Stir, a month either way), reachable by keyboard                            |
| 6   | No keyboard control beyond Tab                                                                                               | Medium   | `+` `−` `0` resize, `F` full screen, `D` debug, `?` help, `Esc` leaves full screen                                                               |
| 7   | The camera was a card between a header and a footer on a phone                                                               | Medium   | **Full screen** (the button on the stage, or `F`): the page's own on Android and desktops, the stage filling the window on an iPhone             |
| 8   | No way to choose a camera (a laptop's second webcam, a phone's other lens)                                                   | Medium   | A switch button on the stage when there is more than one                                                                                         |
| 9   | The start screen didn't say where the watch app comes from, nor what to do without a watch                                   | Medium   | "Open WristMarkCompanion on your watch"; "No watch at hand?" leads to the markers                                                                |
| 10  | The footer offered the device test to every visitor                                                                          | Low      | It moved into the help, under "For testers"; the footer has the markers, help and privacy                                                        |
| 11  | The marker page showed bare IDs, and stepped through all 50                                                                  | Low      | "ID 15 · Dice"; next and previous step through the markers that have a model, as the watch does                                                  |
| 12  | axe: no level-one heading while the camera runs, nor on the marker page                                                      | Moderate | A heading on each page (the viewer's for screen readers only)                                                                                    |
| 13  | axe: the accent blue on light backgrounds 3.5:1 (links on the marker and privacy pages)                                      | Serious  | A darker accent in the light scheme, 5.3:1 or more; the dark scheme keeps its own (4.8:1 or more)                                                |
| 14  | On a 390-pixel phone, the header's buttons ran off the screen                                                                | Medium   | Icons there; their labels stay for screen readers                                                                                                |
| 15  | No icon, no description or preview when the address is shared, no way to add it to the home screen                           | Medium   | [Brand and sharing](#brand-and-sharing)                                                                                                          |
| 16  | The README was written for developers only, and no guide for the people who use it                                           | Medium   | [Brand and sharing](#brand-and-sharing)                                                                                                          |

After the changes, axe finds **no violations** on any page or state, in either scheme.

## Brand and sharing

The name **WristMarkCompanion**, the tagline **"Your watch, in 3D"**, the marker-in-a-rounded-square
logo in the accent's blue-to-violet gradient, a dark, quiet interface. The second part of this
review gives them the places a customer meets them: the browser tab's icon, the home screen, a
shared link's preview, the README's first screen, a guide for users, and the store's listing.

## Left for later

- **The watch app's own text:** it shows "ID 15" under the marker; the model's name would read
  better, if it fits the round display's lower edge (to be checked in the simulator).
- **After the device tests:** the gestures' thresholds, the tips' distances, and whether the hint
  should go once the model has been seen a few times.
- **A user's choice of size kept** between visits needs browser storage, which the privacy page
  would then name.
