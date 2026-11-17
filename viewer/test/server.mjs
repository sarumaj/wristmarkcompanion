// A static server for the tests, laid out as the image is (Dockerfile): public/ at
// the root, the libraries under vendor/. It sends nginx.conf's
// Content-Security-Policy, so the tests run under the policy production has.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const VIEWER = fileURLToPath(new URL("..", import.meta.url));
const ROUTES = [
  ["/vendor/mediapipe/hand_landmarker.task", join(VIEWER, "node_modules/.cache/hand_landmarker.task")],
  ["/vendor/mediapipe/", join(VIEWER, "node_modules/@mediapipe/tasks-vision")],
  ["/vendor/js-aruco2/", join(VIEWER, "node_modules/js-aruco2/src")],
  ["/vendor/three/", join(VIEWER, "node_modules/three/build")],
  ["/", join(VIEWER, "public")],
];
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
};

async function policy() {
  const config = await readFile(join(VIEWER, "nginx.conf"), "utf8");
  const match = config.match(/add_header Content-Security-Policy "([^"]+)"/);
  if (!match) {
    throw new Error("nginx.conf has no Content-Security-Policy");
  }
  return match[1];
}

// The hand tracking's model (hand-model.txt): downloaded once into node_modules/.cache,
// checked against its SHA-256 as the Dockerfile does.
async function handModel() {
  const path = join(VIEWER, "node_modules/.cache/hand_landmarker.task");
  const [url, sha256] = (await readFile(join(VIEWER, "hand-model.txt"), "utf8")).trim().split(/\s+/);
  const digest = (data) => createHash("sha256").update(data).digest("hex");
  const cached = await readFile(path).catch(() => null);
  if (cached && digest(cached) === sha256) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== sha256) throw new Error(`${url}: not the SHA-256 hand-model.txt gives`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

// Starts the server on a free port of 127.0.0.1; resolves to {url, close}.
export async function serve() {
  const csp = await policy();
  await handModel();
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    // As nginx.conf answers while the relay isn't deployed.
    if (path === "/relay/v1/healthz") {
      response.writeHead(200, { "Content-Type": "application/json", "Content-Security-Policy": csp });
      response.end('{"status":"off"}');
      return;
    }
    const [prefix, root] = ROUTES.find(([route]) => path.startsWith(route));
    // A route to a single file serves it as is.
    const relative = path === prefix ? "." : normalize(path.slice(prefix.length) || "index.html");
    if (relative.startsWith("..")) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(join(root, relative.endsWith("/") ? `${relative}index.html` : relative));
      response.writeHead(200, {
        "Content-Type": TYPES[extname(relative)] ?? "application/octet-stream",
        "Content-Security-Policy": csp,
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
