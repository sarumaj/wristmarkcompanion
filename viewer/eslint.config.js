import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["public/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["eslint.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    // The tests run in Node; their page.evaluate() callbacks run in the browser.
    files: ["test/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
