# Content: what each marker shows

The viewer shows a model for each marker ID that `viewer/public/content.json` maps, and draws
the axis gizmo for any other ID. It works the same on a phone (rear camera) and on a laptop
(webcam).

## The mapping

```json
{
  "markers": {
    "0": { "model": "cube", "name": "Cube" },
    "1": { "model": "knot", "name": "Torus knot" }
  }
}
```

- **Keys** are marker IDs, 0-49 (DICT_4X4_50, [002](decisions/002-marker-dictionary.md)).
- **`model`** is one of the models in `viewer/public/js/models.js`. **`name`** is shown in the
  status line.
- **Checked on load** (`js/content.js`): an unknown key, model or field, or an ID out of range,
  stops the viewer with the reason, instead of showing nothing. `viewer/test` checks the shipped
  file and the check itself.
- **An ID without an entry** shows the axis gizmo, and the status says "no content". That's
  how a new watch ID shows up before it has a model.
- **Switching:** the model changes when the camera sees another ID (the watch's next and
  previous buttons, or its automatic cycle). The new marker's pose starts afresh, without the
  smoothing of the old one.

## The placeholder models

All four are generated in code with three.js's geometries (`js/models.js`), so there are no asset
files and nothing to license apart from this project's own code (GPL-3.0). Each stands on the
marker's face, sized from the marker's side, and moves a little so that it reads as 3D.

| ID  | Model     | What                                         |
|-----|-----------|----------------------------------------------|
| 0   | `cube`    | A cube with a color per face, turning slowly |
| 1   | `knot`    | A torus knot above the marker, turning       |
| 2   | `planet`  | A planet with a ring and a moon orbiting it  |
| 3   | `crystal` | A flat-shaded crystal floating up and down   |

A model from a file (glTF) would need three.js's loader added to the image and its license
recorded here. Large files need the owner's approval first ([CI](ci.md)).

## The debug overlay

The **Debug** button, or `?debug` in the address, shows a box over the camera image with the
numbers the range tests ([milestone 4](../README.md)) record:

| Line          | Meaning                                                      |
|---------------|--------------------------------------------------------------|
| `ID`          | The marker shown, or `-`                                     |
| `distance`    | The smoothed pose's distance from the camera, in millimeters |
| `FPS`         | Frames processed in the last second                          |
| `detection`   | The share of those frames in which the marker was found      |
| `detect time` | How long detection and pose took per frame, on average       |
| `camera`      | The camera's resolution                                      |
| `detected at` | The resolution frames are scaled to for detection            |

With the overlay on, the gizmo is drawn with the model too, which shows how well the model sits
on the marker. The distance depends on the assumed field of view and marker size
([003](decisions/003-pose.md)): `?fov=` and `?size=` set them.

## More models

[Model ideas](model-ideas.md) collects what could replace the placeholders, by what each one
needs: from the moon phase and a globe with day and night to aviation, navigation and playful
ones.
