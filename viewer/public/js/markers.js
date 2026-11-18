// The marker dictionary of both sides: OpenCV's DICT_4X4_50, which is the first 50
// codes of js-aruco2's ARUCO_4X4_1000 (docs/dev/decisions/002-marker-dictionary.md).
// The watch's table (watch/source/MarkerDictionary.mc) is generated from the same
// library file. Needs the classic scripts vendor/js-aruco2/cv.js, aruco.js and
// dictionaries/aruco_4x4_1000.js loaded first (they define the global AR).
/* global AR */

export const DICTIONARY = "WRISTMARK_4X4_50";
export const MARKER_COUNT = 50;
// Data cells per side; the marker adds a black border of one cell around them.
export const DATA_CELLS = 4;
export const MARKER_CELLS = DATA_CELLS + 2;
// js-aruco2 accepts a code closer than this (Dictionary.find: distance < tau), so 2
// corrects one wrong bit, as OpenCV does for DICT_4X4_50 (maxCorrectionBits 1).
// Its own default would be the codes' smallest distance, which allows more.
export const MAX_HAMMING_DISTANCE = 2;

let dictionary = null;

// The dictionary, registered with js-aruco2 on first use.
export function markerDictionary() {
  if (dictionary) {
    return dictionary;
  }
  if (typeof AR === "undefined" || !AR.DICTIONARIES.ARUCO_4X4_1000) {
    throw new Error("js-aruco2 and its ARUCO_4X4_1000 dictionary are not loaded");
  }
  AR.DICTIONARIES[DICTIONARY] = {
    nBits: DATA_CELLS * DATA_CELLS,
    tau: MAX_HAMMING_DISTANCE,
    codeList: AR.DICTIONARIES.ARUCO_4X4_1000.codeList.slice(0, MARKER_COUNT),
  };
  dictionary = new AR.Dictionary(DICTIONARY);
  return dictionary;
}

// The marker's cells, border included, row by row from the top left: true is white.
// The library's code is the data cells as a string of bits, 1 for white.
export function markerCells(id) {
  if (!Number.isInteger(id) || id < 0 || id >= MARKER_COUNT) {
    throw new RangeError(`marker ID ${id} is not in 0-${MARKER_COUNT - 1}`);
  }
  const code = markerDictionary().codeList[id];
  return Array.from({ length: MARKER_CELLS }, (_, row) =>
    Array.from({ length: MARKER_CELLS }, (_, col) => {
      const border = row === 0 || col === 0 || row === MARKER_CELLS - 1 || col === MARKER_CELLS - 1;
      return !border && code[(row - 1) * DATA_CELLS + (col - 1)] === "1";
    }),
  );
}

// Draws the marker with its top left corner at (x, y), each cell `cell` pixels:
// black cells only, over the white the caller has filled (the quiet zone).
export function drawMarker(context, id, x, y, cell) {
  const cells = markerCells(id);
  context.fillStyle = "#000";
  cells.forEach((line, row) =>
    line.forEach((white, col) => {
      if (!white) {
        context.fillRect(x + col * cell, y + row * cell, cell, cell);
      }
    }),
  );
}
