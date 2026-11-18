# 002: Marker dictionary: OpenCV DICT_4X4_50

Status: accepted (milestone 1).

## Question

Which ArUco dictionary the watch draws and the viewer detects, and how both sides are guaranteed
to use the same bit patterns.

## Decision

**OpenCV's `DICT_4X4_50`**: 4x4 data cells inside a one-cell black border, so 6x6 cells in all,
and 50 IDs.

- **Largest cells:** with 6 cells across, each cell is a sixth of the marker. A 5x5 dictionary
  would have 7 cells across, each about 14 % smaller, and a 6x6 dictionary 8 cells, 25 % smaller.
  Cell size limits the detection range.
- **50 IDs** are more than the content needs, and a smaller set keeps the codes further apart:
  at least 4 bits in every rotation. The generator computes and checks this.
- **One bit of correction:** OpenCV corrects at most 1 bit for this dictionary
  (`aruco_dictionary.cpp`: `DICT_4X4_50_DATA`, `maxCorrectionBits (4-1)/2`). The viewer sets the
  same limit in js-aruco2 ([001](001-detection-library.md)).

## One source for both sides

OpenCV builds `DICT_4X4_50` from the first 50 entries of the same byte table as
`DICT_4X4_1000`. js-aruco2 ships that table as `ARUCO_4X4_1000`
(`src/dictionaries/aruco_4x4_1000.js`, taken from OpenCV).

- **The viewer** uses the library's `ARUCO_4X4_1000` codes 0 to 49.
- **The watch** uses `watch/source/MarkerDictionary.mc`. `tools/generate-dictionary.mjs`
  writes that file from the same library file, read from `viewer/node_modules`, so it comes from
  the version pinned in `viewer/package-lock.json`. It parses the data and doesn't run it. The
  generated file states the library version and how to regenerate it, and carries OpenCV's BSD
  license notice.
- **CI** runs the generator with `--check` and fails when the committed file differs. A Renovate
  update of js-aruco2 that changed the codes would fail there.

The generated table was checked once against OpenCV's own source on 2026-11-15: all 50 codes
equal the first 50 entries of `DICT_4X4_1000_BYTES` in
`modules/objdetect/src/aruco/predefined_dictionaries.hpp`.

## Bit layout

Each code is 16 bits. Bit 15 is the top-left data cell, then the cells go row by row to bit 0
at the bottom right. A 1 is white and a 0 black. This is how js-aruco2 reads them: its
`Dictionary._bytes2bin` takes each byte most significant bit first, and `Detector.getMarker`
reads the cells row by row, with a white cell as 1. The border cells are always black.

## Not decided here

The physical marker size on the watch depends on the screen layout and quiet zone (milestone 2).
