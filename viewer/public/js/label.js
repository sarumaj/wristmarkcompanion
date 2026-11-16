import * as THREE from "../vendor/three/three.module.js";

// A text label floating over a model, drawn on a canvas, always facing the camera;
// `update(lines)` redraws it.
export function label(width) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(width, width / 4, 1);
  let shown = "";
  return {
    sprite,
    update(lines) {
      if (lines.join("\n") === shown) return;
      shown = lines.join("\n");
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(0, 0, 0, 0.55)";
      context.beginPath();
      context.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 24);
      context.fill();
      context.fillStyle = "#fff";
      context.font = "600 40px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      lines.forEach((line, i) => context.fillText(line, canvas.width / 2, 64 + (i - (lines.length - 1) / 2) * 46));
      texture.needsUpdate = true;
    },
  };
}
