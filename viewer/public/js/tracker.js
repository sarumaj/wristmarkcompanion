// Detection and pose of the marker in a camera frame, with js-aruco2 (needs its
// classic scripts: cv.js, aruco.js, dictionaries/aruco_4x4_1000.js, svd.js,
// posit1.js). Units: the marker's side in millimeters, so the pose's translation is
// in millimeters too.
/* global AR, POS */
import { DICTIONARY, MAX_HAMMING_DISTANCE, markerDictionary } from "./markers.js";
import { refinePose } from "./pose-refine.js";
import { refineCorners } from "./refine.js";

// The focal length in pixels of an image `width` by `height` pixels whose camera sees
// `fovDegrees` across its longer side, the sensor's: a phone held upright delivers its
// frames turned, 720 wide and 1280 high. Browsers don't expose the real intrinsics, so the
// viewer assumes a typical phone main camera (docs/dev/decisions/003-pose.md).
export function focalLength(width, fovDegrees, height = 0) {
  return Math.max(width, height) / 2 / Math.tan((fovDegrees * Math.PI) / 360);
}

export class MarkerTracker {
  constructor({ markerSize, fovDegrees }) {
    markerDictionary();
    this.detector = new AR.Detector({ dictionaryName: DICTIONARY, maxHammingDistance: MAX_HAMMING_DISTANCE });
    this.markerSize = markerSize;
    this.fovDegrees = fovDegrees;
    this.posit = null;
    this.positFocal = 0;
  }

  // The markers in an ImageData: [{id, corners: [{x, y}] (clockwise from the
  // marker's own top left, in image pixels: a pixel's center at its index)}], the
  // corners refined to a fraction of a pixel (js/refine.js) unless `refine` is false.
  detect(image, { refine = true } = {}) {
    const markers = this.detector.detectImage(image.width, image.height, image.data);
    if (refine) for (const marker of markers) marker.corners = refineCorners(this.detector.grey, marker.corners);
    return markers;
  }

  // The marker's pose, or null when POSIT finds none: {best, alternative}, each
  // {rotation (3x3, rows), translation [x, y, z], error (pixels)}, in POSIT's camera
  // frame: x right, y up, z away from the camera. The two are the planar marker's
  // ambiguity; the alternative is null when POSIT finds only one.
  pose(marker, width, height) {
    const focal = focalLength(width, this.fovDegrees, height);
    if (!this.posit || this.positFocal !== focal) {
      this.posit = new POS.Posit(this.markerSize, focal);
      this.positFocal = focal;
    }
    // POSIT wants the corners around the image's center, y up; a pixel's center is half
    // a pixel past its index.
    const points = marker.corners.map((corner) => ({ x: corner.x + 0.5 - width / 2, y: height / 2 - corner.y - 0.5 }));
    const pose = this.posit.pose(points);
    // Each of POSIT's solutions refined to fit the corners best (js/pose-refine.js);
    // its error is then the corners' distance in pixels.
    const solution = (rotation, translation, error) =>
      error >= 0 && translation.every(Number.isFinite) && rotation.flat().every(Number.isFinite)
        ? refinePose({ rotation, translation }, points, this.markerSize, focal)
        : null;
    const solutions = [
      solution(pose.bestRotation, pose.bestTranslation, pose.bestError),
      solution(pose.alternativeRotation, pose.alternativeTranslation, pose.alternativeError),
    ]
      .filter((s) => s && Number.isFinite(s.error) && s.translation[2] > 0)
      .sort((a, b) => a.error - b.error);
    if (!solutions.length) {
      return null;
    }
    return { best: solutions[0], alternative: solutions[1] ?? null };
  }
}
