// Lets Node import the page's modules that import from vendor/ (support/vendor-hooks.mjs).
import { register } from "node:module";

register("./vendor-hooks.mjs", import.meta.url);
