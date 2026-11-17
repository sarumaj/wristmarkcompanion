// js-aruco2's classic scripts (they define the globals CV, AR, SVD and POS) loaded into
// Node's global scope, as the viewer's page loads them, so the tracker runs in Node.
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";

const SOURCE = new URL("../../node_modules/js-aruco2/src/", import.meta.url);
for (const file of ["cv.js", "aruco.js", "dictionaries/aruco_4x4_1000.js", "svd.js", "posit1.js"]) {
  runInThisContext(readFileSync(new URL(file, SOURCE), "utf8"), { filename: file });
}
