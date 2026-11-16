#!/usr/bin/env node
// Aligns the Markdown tables of the given files: every column padded to its widest
// cell, so that the pipes line up (markdownlint MD060 "aligned", .markdownlint.jsonc).
// markdownlint reports misaligned tables but doesn't fix them.
//
//   node tools/align-tables.mjs README.md docs/*.md   rewrite the files
//
// A cell ends at a pipe that is neither escaped (\|) nor inside a code span. Code
// blocks are left alone. Widths count characters (code points), as markdownlint does.

import { readFileSync, writeFileSync } from "node:fs";

function cells(line) {
  const out = [];
  let cell = "";
  let code = false;
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === "\\" && body[i + 1] === "|") {
      cell += "\\|";
      i++;
    } else if (char === "`") {
      code = !code;
      cell += char;
    } else if (char === "|" && !code) {
      out.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  out.push(cell.trim());
  return out;
}

const width = (text) => [...text].length;

function align(rows) {
  const table = rows.map(cells);
  const columns = Math.max(...table.map((row) => row.length));
  for (const row of table) {
    while (row.length < columns) row.push("");
  }
  const delimiter = table[1];
  if (!delimiter.every((cell) => /^:?-+:?$/.test(cell))) {
    throw new Error(`not a table's delimiter row: ${rows[1]}`);
  }
  const widths = Array.from({ length: columns }, (_, col) =>
    Math.max(3, ...table.filter((_, row) => row !== 1).map((row) => width(row[col]))),
  );
  // The delimiter row without spaces, its dashes as wide as the padded cells, as in
  // the homelab's documentation: |------|:----:|.
  return table.map((row, index) =>
    index === 1
      ? `|${row
          .map((cell, col) => {
            const left = cell.startsWith(":") ? ":" : "-";
            const right = cell.endsWith(":") ? ":" : "-";
            return left + "-".repeat(widths[col]) + right;
          })
          .join("|")}|`
      : `| ${row.map((cell, col) => cell + " ".repeat(widths[col] - width(cell))).join(" | ")} |`,
  );
}

for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, "utf8").split("\n");
  const out = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (!fence && lines[i].trimStart().startsWith("|")) {
      const start = i;
      while (i + 1 < lines.length && lines[i + 1].trimStart().startsWith("|")) i++;
      out.push(...align(lines.slice(start, i + 1)));
    } else {
      out.push(lines[i]);
    }
  }
  const text = out.join("\n");
  if (text !== lines.join("\n")) {
    writeFileSync(file, text);
    console.log(`aligned: ${file}`);
  }
}
