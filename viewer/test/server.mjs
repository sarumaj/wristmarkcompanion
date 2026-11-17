// A static server for the tests, laid out as the image is (Dockerfile): public/ at
// the root, the libraries under vendor/. It sends nginx.conf's
// Content-Security-Policy, so the tests run under the policy production has.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const VIEWER = fileURLToPath(new URL("..", import.meta.url));
const ROUTES = [
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
};

async function policy() {
  const config = await readFile(join(VIEWER, "nginx.conf"), "utf8");
  const match = config.match(/add_header Content-Security-Policy "([^"]+)"/);
  if (!match) {
    throw new Error("nginx.conf has no Content-Security-Policy");
  }
  return match[1];
}

// Starts the server on a free port of 127.0.0.1; resolves to {url, close}.
export async function serve() {
  const csp = await policy();
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const [prefix, root] = ROUTES.find(([route]) => path.startsWith(route));
    const relative = normalize(path.slice(prefix.length) || "index.html");
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
