// Detection and pose of the marker in a camera frame, with js-aruco2 (needs its
// classic scripts: cv.js, aruco.js, dictionaries/aruco_4x4_1000.js, svd.js,
// posit1.js). Units: the marker's side in millimeters, so the pose's translation is
// in millimeters too.
/* global AR, POS */
import { DICTIONARY, MAX_HAMMING_DISTANCE, markerDictionary } from "./markers.js";

// The focal length in pixels of an image `width` pixels wide whose camera sees
// `fovDegrees` across. Browsers don't expose the real intrinsics, so the viewer
// assumes a typical phone main camera (docs/decisions/003-pose.md).
export function focalLength(width, fovDegrees) {
  return width / 2 / Math.tan((fovDegrees * Math.PI) / 360);
}

export class MarkerTracker {
  constructor({ markerSize, fovDegrees }) {
    markerDictionary();
    this.detector = new AR.Detector({ dictionaryName: DICTIONARY, maxHammingDistance: MAX_HAMMING_DISTANCE });
    this.markerSize = markerSize;
    this.fovDegrees = fovDegrees;
    this.posit = null;
    this.positWidth = 0;
  }

  // The markers in an ImageData: [{id, corners: [{x, y}] (clockwise from the
  // marker's own top left, in image pixels)}].
  detect(image) {
    return this.detector.detectImage(image.width, image.height, image.data);
  }

  // The marker's pose, or null when POSIT finds none: {best, alternative}, each
  // {rotation (3x3, rows), translation [x, y, z], error (pixels)}, in POSIT's camera
  // frame: x right, y up, z away from the camera. The two are the planar marker's
  // ambiguity; the alternative is null when POSIT finds only one.
  pose(marker, width, height) {
    if (!this.posit || this.positWidth !== width) {
      this.posit = new POS.Posit(this.markerSize, focalLength(width, this.fovDegrees));
      this.positWidth = width;
    }
    // POSIT wants the corners around the image's center, y up.
    const points = marker.corners.map((corner) => ({ x: corner.x - width / 2, y: height / 2 - corner.y }));
    const pose = this.posit.pose(points);
    const solution = (rotation, translation, error) =>
      error >= 0 && translation.every(Number.isFinite) ? { rotation, translation, error } : null;
    const best = solution(pose.bestRotation, pose.bestTranslation, pose.bestError);
    if (!best) {
      return null;
    }
    return { best, alternative: solution(pose.alternativeRotation, pose.alternativeTranslation, pose.alternativeError) };
  }
}
