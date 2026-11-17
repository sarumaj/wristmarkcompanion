// Points (embers, bubbles, snow, sparks) drawn as soft round dots instead of three.js's
// squares: a radial gradient as the points' texture.
import * as THREE from "../vendor/three/three.module.js";

// A soft round dot, white, for points to be drawn with instead of squares; made once.
let dotTexture = null;
export function dot() {
  if (dotTexture) return dotTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.8)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(canvas);
  return dotTexture;
}
