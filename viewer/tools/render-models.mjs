// Renders a picture of every model content.json maps, for the documentation:
// docs/images/models/<model>.webp, 320 pixels square, each on a dark watch seen at an angle,
// at a fixed date and at a moment of its loop that shows what it does (MOMENTS). Run it in
// Playwright's image, as the tests run, after adding or changing a model:
//
//   docker run --rm --ipc=host -v "$PWD":/w -w /w/viewer \
//     mcr.microsoft.com/playwright:v1.64.1-noble node tools/render-models.mjs [model ...]
//
// The test "every mapped model has its picture" (test/content.test.mjs) fails while one is
// missing. Rendering is software WebGL (SwiftShader), so the pictures are the same each run.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "../test/server.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = `${ROOT}docs/images/models`;
const SIZE = 320;
// The date every picture shows, so that the moon, the globes and the seasons don't change
// from one run to the next: an afternoon in November (UTC).
const DATE = "2026-11-16T14:00:00Z";

// The moment (seconds into the loop) and, where it matters, the date and the view: where
// a model is busiest or reads best. Models not listed are shown at 2 seconds.
const MOMENTS = {
  crystal: { t: 3.1 },
  landing: { t: 9 },
  fireworks: { t: 2.6 },
  helicopter: { t: 9 },
  dice: { t: 0.5 },
  balloon: { t: 0.5 },
  rocket: { t: 6.5 },
  attitude: { t: 1, view: "roll" },
  maze: { t: 3 },
  ferrisWheel: { t: 2, date: "2026-11-16T20:00:00" },
  bonsai: { t: 1, date: "2026-04-15T12:00:00Z" },
  newtonsCradle: { t: 0.3 },
  volcano: { t: 0.9 },
  ufo: { t: 9 },
  raceTrack: { t: 6 },
  sundial: { t: 1, date: "2026-11-16T10:00:00" },
};

// The cameras: at an angle from the watch's bottom edge, or head-on and turned (for the
// attitude indicator, whose horizon stays level with the image).
const VIEWS = {
  oblique: { position: [0, -135, 105], up: [0, 0, 1], target: [0, 0, 27] },
  roll: { position: [0, -25, 140], up: [0.5, 0.87, 0], target: [0, 0, 15] },
};

const content = JSON.parse(await readFile(`${ROOT}viewer/public/content.json`, "utf8"));
const wanted = process.argv.slice(2);
const models = [...new Set(Object.values(content.markers).map((entry) => entry.model))].filter(
  (model) => !wanted.length || wanted.includes(model),
);

await mkdir(OUT, { recursive: true });
const server = await serve();
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await (await browser.newContext({ viewport: { width: SIZE, height: SIZE } })).newPage();
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(`${server.url}/markers.html`);
  for (const model of models) {
    const { t = 2, date = DATE, view = "oblique" } = MOMENTS[model] ?? {};
    const data = await page.evaluate(
      async ({ model, t, date, camera, size }) => {
        const THREE = await import("/vendor/three/three.module.js");
        const { createModel, lights } = await import("/js/models.js");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
        renderer.setClearColor(0x1f232b);
        const scene = new THREE.Scene();
        scene.add(...lights());
        const eye = new THREE.PerspectiveCamera(42, 1, 1, 1000);
        eye.position.set(...camera.position);
        eye.up.set(...camera.up);
        eye.lookAt(...camera.target);
        // The watch: a dark case with its display drawn black, as the viewer draws it.
        const display = new THREE.Mesh(new THREE.CircleGeometry(17.8, 64), new THREE.MeshBasicMaterial({ color: 0x050608 }));
        display.position.z = 0.05;
        const watch = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 3, 64), new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.3, roughness: 0.5 }));
        watch.rotation.x = Math.PI / 2;
        watch.position.z = -1.6;
        scene.add(watch, display);
        // The size the viewer builds them at: 2.5 times a 20-millimeter marker.
        const instance = createModel(model, 50, { now: () => new Date(date) });
        scene.add(instance.object);
        // Up to the moment in steps, so that models that integrate (the maze, the
        // jellyfish) get there as they would.
        for (let k = 0; k <= 40; k++) instance.animate((t * k) / 40);
        renderer.render(scene, eye);
        // Once more: models that read the camera while drawing (the attitude indicator) now
        // have it.
        instance.animate(t);
        renderer.render(scene, eye);
        return canvas.toDataURL("image/webp", 0.82);
      },
      { model, t, date, camera: VIEWS[view], size: SIZE },
    );
    const file = `${OUT}/${model}.webp`;
    await writeFile(file, Buffer.from(data.split(",")[1], "base64"));
    console.log(`wrote docs/images/models/${model}.webp`);
  }
} finally {
  await browser.close();
  await server.close();
}
