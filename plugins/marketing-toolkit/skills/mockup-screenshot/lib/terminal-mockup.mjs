#!/usr/bin/env node
// Renders a JSON line-spec into a labeled, macOS-terminal-styled SVG mockup.
// Library use:   import { buildTerminalSVG } from "./terminal-mockup.mjs"
// CLI use:       node terminal-mockup.mjs <spec.json> -o <out.svg>

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const COLORS = {
  bg: "#1e2127",
  bar: "#2c313a",
  text: "#d8dee9",
  dim: "#5c6370",
  green: "#98c379",
  red: "#e06c75",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
};

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/**
 * spec = {
 *   title: string,             // shown centered in the title bar
 *   width?: number,            // default 900
 *   lines: Array<
 *     string                                        // plain line, default color
 *     | Array<{ t: string, c?: keyof COLORS, b?: boolean }>  // colored/bold spans
 *   >
 * }
 * Blank string "" renders as a blank line (spacer).
 */
export function buildTerminalSVG(spec) {
  const { title, lines, width = 900 } = spec;
  if (!title) throw new Error("spec.title is required");
  if (!Array.isArray(lines)) throw new Error("spec.lines must be an array");

  const lh = 20;
  const padX = 20;
  const padTop = 52;
  const padBottom = 18;
  const height = padTop + lines.length * lh + padBottom;

  const body = lines
    .map((line, i) => {
      const y = padTop + (i + 0.75) * lh;
      const spans = (typeof line === "string" ? [{ t: line }] : line)
        .map((s) => {
          const color = COLORS[s.c] ?? COLORS.text;
          const weight = s.b ? ' font-weight="bold"' : "";
          return `<tspan fill="${color}"${weight}>${esc(s.t)}</tspan>`;
        })
        .join("");
      return `<text x="${padX}" y="${y.toFixed(1)}" xml:space="preserve" class="mono">${spans}</text>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">
  <style>.mono{font-size:13px;white-space:pre}</style>
  <rect width="${width}" height="${height}" rx="10" fill="${COLORS.bg}"/>
  <path d="M0 10a10 10 0 0 1 10-10h${width - 20}a10 10 0 0 1 10 10v26H0z" fill="${COLORS.bar}"/>
  <circle cx="20" cy="18" r="6" fill="#ff5f57"/>
  <circle cx="40" cy="18" r="6" fill="#febc2e"/>
  <circle cx="60" cy="18" r="6" fill="#28c840"/>
  <text x="${width / 2}" y="22" text-anchor="middle" fill="${COLORS.dim}" font-size="12">${esc(title)}</text>
  <text x="${width - 16}" y="22" text-anchor="end" fill="${COLORS.dim}" font-size="10" font-style="italic">example output</text>
  ${body}
</svg>
`;
}

function runCLI() {
  const args = process.argv.slice(2);
  const specPath = args[0];
  const outIdx = args.findIndex((a) => a === "-o" || a === "--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

  if (!specPath) {
    console.error(
      "Usage: node terminal-mockup.mjs <spec.json> [-o out.svg]\n" +
        "Without -o, prints SVG to stdout.",
    );
    process.exit(1);
  }

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const svg = buildTerminalSVG(spec);

  if (outPath) {
    writeFileSync(outPath, svg);
    console.log(`wrote ${outPath}`);
  } else {
    process.stdout.write(svg);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCLI();
}
