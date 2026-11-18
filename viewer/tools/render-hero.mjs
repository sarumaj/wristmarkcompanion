// Renders the Connect IQ Store's hero image (docs/dev/publishing.md#images),
// docs/dev/store-assets/hero.png, 1440 × 720 pixels, and from it the Android app's feature
// graphic for F-Droid and Google Play (docs/dev/google-play.md),
// fastlane/metadata/android/en-US/images/featureGraphic.jpg (JPEG: Play takes no alpha),
// 1024 × 500: scaled to 1024 × 512, 6 pixels cut off at the top and the bottom; and the viewer's
// social card for shared links and the README, viewer/public/social.jpg, 1200 × 630: scaled to
// 1260 × 630, 30 pixels cut off at each side (JPEG, small: it stays in Git, docs/dev/ci.md).
// On the left the app's name, its line and what it does; on the right a forearm wearing a round smartwatch (no particular
// one: no device's or maker's branding) with a model standing on its display, framed as the
// camera sees it. The text is English: the stores want an image per language where there's
// text.
//
//   docker run --rm --ipc=host -v "$PWD":/w -v <directory of the font>:/fonts:ro -w /w/viewer \
//     mcr.microsoft.com/playwright:v1.64.1-noble node tools/render-hero.mjs /fonts/InterVariable.ttf
//
// The font file (Inter, SIL Open Font License: https://rsms.me/inter/) is an argument, not
// part of the repository; without it the image's text falls back to the system's sans-serif.
// Rendering is software WebGL (SwiftShader), so the image is the same each run.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "../test/server.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = `${ROOT}docs/dev/store-assets/hero.png`;
const FEATURE = `${ROOT}fastlane/metadata/android/en-US/images/featureGraphic.jpg`;
const SOCIAL = `${ROOT}viewer/public/social.jpg`;
const WIDTH = 1440;
const HEIGHT = 720;
// The model on the watch, at a moment of its loop that shows it well, at night (its lights).
const MODEL = { model: "ferrisWheel", t: 2, date: "2026-11-16T20:00:00" };
const TEXT = {
  badge: "AR",
  badgeNote: "for your smartwatch",
  name: ["WristMark", "Companion"],
  line: "Your watch, in 3D.",
  pitch: "Point your phone's camera at your wrist: a 3D model stands on your watch, and moves with it.",
  chips: ["Augmented reality", "50 animated models", "Wrist gestures", "Hand tracking", "Runs in the browser"],
};

const fontFile = process.argv[2];
const font = fontFile ? (await readFile(fontFile)).toString("base64") : null;

const server = await serve();
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } })).newPage();
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(`${server.url}/markers.html`);
  const data = await page.evaluate(
    async ({ model, width, height, text, font }) => {
      const THREE = await import("/vendor/three/three.module.js");
      const { createModel, lights } = await import("/js/models.js");
      let family = "system-ui, sans-serif";
      if (font) {
        // As bytes: the page's CSP allows no font from a data: URL.
        const bytes = Uint8Array.from(atob(font), (c) => c.charCodeAt(0));
        const face = new FontFace("Hero", bytes.buffer, { weight: "100 900" });
        await face.load();
        document.fonts.add(face);
        family = "Hero, sans-serif";
      }

      // The 3D part: the right of the image, wider than half so the arm can fade out.
      const sceneWidth = Math.round(width * 0.62);
      const canvas = document.createElement("canvas");
      canvas.width = sceneWidth;
      canvas.height = height;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      scene.add(...lights());
      const rim = new THREE.DirectionalLight(0x8fb0ff, 0.9);
      rim.position.set(-200, 300, 120);
      scene.add(rim);

      // The forearm along x, the watch on top (+z) at the origin; long enough that both its
      // ends are out of the picture or in the fade toward the text (no hand to draw).
      const arm = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({ color: 0xc28f6e, roughness: 0.7 });
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(26, 40, 1100, 64), skin);
      forearm.rotation.z = Math.PI / 2;
      forearm.position.set(330, 0, -30);
      forearm.scale.set(1, 1, 0.8);
      arm.add(forearm);
      // The strap: a band around the wrist, under the case.
      const strapMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.6 });
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(30.5, 30.5, 22, 48, 1, true), strapMaterial);
      strap.material.side = THREE.DoubleSide;
      strap.rotation.z = Math.PI / 2;
      strap.position.set(0, 0, -30);
      strap.scale.set(1, 1, 0.84);
      arm.add(strap);
      // The case, its bezel and two buttons; the display drawn black, as the viewer draws it.
      const caseMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.6, roughness: 0.35 });
      const watchCase = new THREE.Mesh(new THREE.CylinderGeometry(22, 23, 10, 64), caseMaterial);
      watchCase.rotation.x = Math.PI / 2;
      watchCase.position.z = -4.6;
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(20.5, 1.6, 16, 64), new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.5, roughness: 0.4 }));
      bezel.position.z = 0.9;
      const display = new THREE.Mesh(new THREE.CircleGeometry(20, 64), new THREE.MeshBasicMaterial({ color: 0x050608 }));
      display.position.z = 0.5;
      for (const [y, x] of [[23, 8], [23, -8]]) {
        const button = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 4, 16), caseMaterial);
        button.position.set(x, y, -4);
        arm.add(button);
      }
      arm.add(watchCase, bezel, display);
      // The model, as the viewer builds it: 2.5 times a 20-millimeter marker, upright on the display.
      const instance = createModel(model.model, 50, { now: () => new Date(model.date) });
      arm.add(instance.object);
      arm.rotation.z = 0.42;
      scene.add(arm);
      for (let k = 0; k <= 40; k++) instance.animate((model.t * k) / 40);

      const eye = new THREE.PerspectiveCamera(25, sceneWidth / height, 1, 3000);
      eye.position.set(-60, -320, 230);
      eye.up.set(0, 0, 1);
      eye.lookAt(-38, 0, 26);
      renderer.render(scene, eye);
      instance.animate(model.t);
      renderer.render(scene, eye);
      // Where the watch is on screen, for the brackets.
      const project = (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).applyMatrix4(arm.matrixWorld).project(eye);
        return { x: width - sceneWidth + ((v.x + 1) / 2) * sceneWidth, y: ((1 - v.y) / 2) * height };
      };
      const watchCenter = project(0, 0, 0);
      const modelTop = project(0, 0, 70);

      // The image: the viewer's background, the scene faded in from the left, the text.
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const g = out.getContext("2d");
      g.fillStyle = "#07090d";
      g.fillRect(0, 0, width, height);
      const glow = (x, y, rx, ry, color) => {
        g.save();
        g.translate(x, y);
        g.scale(1, ry / rx);
        const gradient = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "rgb(0 0 0 / 0%)");
        g.fillStyle = gradient;
        g.fillRect(-rx, -rx, 2 * rx, 2 * rx);
        g.restore();
      };
      glow(width * 0.72, height * 0.2, width * 0.5, height * 0.7, "rgb(91 140 255 / 30%)");
      glow(width * 0.25, height, width * 0.5, height * 0.5, "rgb(139 92 246 / 22%)");
      // The scene, its left part faded out (a mask drawn over it).
      const layer = document.createElement("canvas");
      layer.width = sceneWidth;
      layer.height = height;
      const l = layer.getContext("2d");
      l.drawImage(canvas, 0, 0);
      l.globalCompositeOperation = "destination-in";
      const fade = l.createLinearGradient(0, 0, sceneWidth * 0.42, 0);
      fade.addColorStop(0, "rgb(0 0 0 / 0%)");
      fade.addColorStop(1, "rgb(0 0 0 / 100%)");
      l.fillStyle = fade;
      l.fillRect(0, 0, sceneWidth, height);
      g.drawImage(layer, width - sceneWidth, 0);

      // AR corner brackets around the watch and its model, in the accent.
      const box = {
        left: watchCenter.x - 140,
        right: watchCenter.x + 140,
        top: Math.min(modelTop.y, watchCenter.y - 120) - 24,
        bottom: watchCenter.y + 64,
      };
      g.strokeStyle = "#7aa2ff";
      g.lineWidth = 4;
      g.lineCap = "round";
      const arm_ = 32;
      for (const [x, y, dx, dy] of [
        [box.left, box.top, 1, 1],
        [box.right, box.top, -1, 1],
        [box.left, box.bottom, 1, -1],
        [box.right, box.bottom, -1, -1],
      ]) {
        g.beginPath();
        g.moveTo(x, y + dy * arm_);
        g.lineTo(x, y);
        g.lineTo(x + dx * arm_, y);
        g.stroke();
      }

      // The text.
      const left = 88;
      g.textBaseline = "alphabetic";
      // The badge: "AR" in a pill with the accent's gradient, and its note.
      const badgeY = 178;
      g.font = `800 26px ${family}`;
      const badgeWidth = g.measureText(text.badge).width + 34;
      const pill = g.createLinearGradient(left, 0, left + badgeWidth, 0);
      pill.addColorStop(0, "#5b8cff");
      pill.addColorStop(1, "#9b6bff");
      g.fillStyle = pill;
      g.beginPath();
      g.roundRect(left, badgeY - 30, badgeWidth, 42, 21);
      g.fill();
      g.fillStyle = "#ffffff";
      g.fillText(text.badge, left + 17, badgeY);
      g.font = `500 24px ${family}`;
      g.fillStyle = "#aab4c8";
      g.fillText(text.badgeNote, left + badgeWidth + 16, badgeY - 1);
      // The name: its two parts as the viewer's header writes them.
      g.font = `800 76px ${family}`;
      g.fillStyle = "#ffffff";
      g.fillText(text.name[0], left, 278);
      const first = g.measureText(text.name[0]).width;
      g.fillStyle = "#9db5ff";
      g.fillText(text.name[1], left + first, 278);
      // The line, and the pitch wrapped to the text's column.
      g.font = `700 46px ${family}`;
      g.fillStyle = "#e8ecf4";
      g.fillText(text.line, left, 348);
      g.font = `400 25px ${family}`;
      g.fillStyle = "#aab4c8";
      const column = 600;
      let line = "";
      let y = 400;
      for (const word of text.pitch.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width > column) {
          g.fillText(line, left, y);
          y += 36;
          line = word;
        } else {
          line = next;
        }
      }
      g.fillText(line, left, y);
      // The chips: outlined, in rows within the column.
      g.font = `600 21px ${family}`;
      let x = left;
      y += 62;
      for (const chip of text.chips) {
        const w = g.measureText(chip).width + 32;
        if (x + w > left + column + 40) {
          x = left;
          y += 52;
        }
        g.fillStyle = "rgb(255 255 255 / 6%)";
        g.strokeStyle = "rgb(157 181 255 / 45%)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect(x, y - 28, w, 40, 20);
        g.fill();
        g.stroke();
        g.fillStyle = "#dfe6f5";
        g.fillText(chip, x + 16, y - 1);
        x += w + 12;
      }
      // Google Play's feature graphic: 1024 × 500, the hero scaled, its edges cut.
      const feature = document.createElement("canvas");
      feature.width = 1024;
      feature.height = 500;
      const scale = 1024 / width;
      feature.getContext("2d").drawImage(out, 0, -(height * scale - 500) / 2, 1024, height * scale);
      // The social card: 1200 × 630, the hero scaled to its height, its sides cut.
      const social = document.createElement("canvas");
      social.width = 1200;
      social.height = 630;
      const socialScale = 630 / height;
      social.getContext("2d").drawImage(out, -(width * socialScale - 1200) / 2, 0, width * socialScale, 630);
      return [out.toDataURL("image/png"), feature.toDataURL("image/jpeg", 0.92), social.toDataURL("image/jpeg", 0.86)];
    },
    { model: MODEL, width: WIDTH, height: HEIGHT, text: TEXT, font },
  );
  await mkdir(`${ROOT}docs/dev/store-assets`, { recursive: true });
  await mkdir(`${ROOT}fastlane/metadata/android/en-US/images`, { recursive: true });
  await writeFile(OUT, Buffer.from(data[0].split(",")[1], "base64"));
  await writeFile(FEATURE, Buffer.from(data[1].split(",")[1], "base64"));
  await writeFile(SOCIAL, Buffer.from(data[2].split(",")[1], "base64"));
  console.log("wrote docs/dev/store-assets/hero.png, the feature graphic and the social card");
} finally {
  await browser.close();
  await server.close();
}
