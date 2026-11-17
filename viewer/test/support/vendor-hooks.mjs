// Module resolution for Node's tests: the page's vendor/ paths, which nginx serves from
// the packages (Dockerfile), resolved to the packages in node_modules.
const VENDOR = { "/vendor/three/": new URL("../../node_modules/three/build/", import.meta.url).href };

export async function resolve(specifier, context, next) {
  for (const [path, target] of Object.entries(VENDOR)) {
    const at = specifier.indexOf(path.slice(1));
    if (specifier.includes(path) || (at >= 0 && specifier.startsWith("../"))) {
      return next(target + specifier.slice(at + path.length - 1), context);
    }
  }
  return next(specifier, context);
}
