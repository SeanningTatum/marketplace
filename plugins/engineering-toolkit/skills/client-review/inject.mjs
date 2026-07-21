#!/usr/bin/env node
// client-review / inject.mjs
// Turn any HTML doc into a commentable one: inline the annotation layer
// (css + js) plus an empty (or preserved) #brain-comments blob.
//
// Usage: node inject.mjs <doc.html> [-o <out.html>] [--in-place]
//
// Exit codes: 0 success, 1 operational error, 2 usage error.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

function usageError(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.stderr.write('usage: node inject.mjs <doc.html> [-o <out.html>] [--in-place]\n');
  process.exit(2);
}

function opError(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

// --- arg parsing ---

const argv = process.argv.slice(2);
let inputFile = null;
let outFlag = null;
let inPlace = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-o') {
    const val = argv[i + 1];
    if (val === undefined) usageError('-o requires a value');
    outFlag = val;
    i++;
  } else if (a === '--in-place') {
    inPlace = true;
  } else if (a.startsWith('-')) {
    usageError(`unknown flag: ${a}`);
  } else if (inputFile === null) {
    inputFile = a;
  } else {
    usageError(`unexpected extra argument: ${a}`);
  }
}

if (inputFile === null) usageError('missing required argument <doc.html>');
if (outFlag !== null && inPlace) {
  usageError('cannot use -o and --in-place together');
}

// --- read input doc ---

let html;
try {
  html = readFileSync(inputFile, 'utf8');
} catch (err) {
  opError(`could not read "${inputFile}": ${err.message}`);
}

// --- read sibling layer sources, relative to THIS script's own location ---

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cssPath = join(scriptDir, 'lib', 'annotate.css');
const jsPath = join(scriptDir, 'lib', 'annotate.js');

let cssContent, jsContent;
try {
  cssContent = readFileSync(cssPath, 'utf8');
} catch (err) {
  opError(`could not read annotation layer css at "${cssPath}" — check the skill install: ${err.message}`);
}
try {
  jsContent = readFileSync(jsPath, 'utf8');
} catch (err) {
  opError(`could not read annotation layer js at "${jsPath}" — check the skill install: ${err.message}`);
}

// --- shared helper: find a <script ...id="brain-comments"...>...</script> block ---
// Same matching strategy as read.mjs: scan all <script> tags, match by the
// id="brain-comments" attribute (not tag position), tolerant of attribute
// order/whitespace.

function findCommentsBlock(source) {
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const idRe = /\bid\s*=\s*(['"])brain-comments\1/i;
  let match;
  while ((match = scriptRe.exec(source)) !== null) {
    const attrs = match[1] || '';
    if (idRe.test(attrs)) {
      return { fullMatch: match[0], content: match[2], index: match.index };
    }
  }
  return null;
}

// --- preserve existing comments blob content, if any ---

const existingBlock = findCommentsBlock(html);
const DEFAULT_BLOB = '{"schema":"client-review/1","comments":[]}';
const blobContent = existingBlock ? existingBlock.content.trim() : DEFAULT_BLOB;

// --- ensure <html> has data-cr-doc="<key>" and data-cr-stage="draft" ---
// data-cr-stage is preserved if already present, so a file the client
// exported (stamped data-cr-stage="returned") stays in reviewer stage even
// if it is re-injected.

// Quoted-attribute-aware: skip over `>` characters inside quoted attribute
// values so the capture doesn't stop early on a tag like <html lang="a>b">.
const htmlTagRe = /<html\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i;
const htmlTagMatch = htmlTagRe.exec(html);

if (!htmlTagMatch) {
  process.stderr.write('warning: no <html> tag found — annotation layer will fall back to docKey "default"\n');
} else {
  let attrs = htmlTagMatch[1] || '';
  if (!/\bdata-cr-doc\s*=/i.test(attrs)) {
    const key = createHash('sha1').update(parsePath(inputFile).base).digest('hex').slice(0, 8);
    attrs += ` data-cr-doc="${key}"`;
  }
  if (!/\bdata-cr-stage\s*=/i.test(attrs)) {
    attrs += ' data-cr-stage="draft"';
  }
  const newTag = `<html${attrs}>`;
  html = html.slice(0, htmlTagMatch.index) + newTag + html.slice(htmlTagMatch.index + htmlTagMatch[0].length);
}

// --- build the injected region ---

const region =
  '<!-- client-review:injected -->\n' +
  `<style data-cr-ui>${cssContent}</style>\n` +
  `<script type="application/json" id="brain-comments">${blobContent}</script>\n` +
  `<script data-cr-ui>${jsContent}</script>\n` +
  '<!-- /client-review:injected -->';

// --- idempotency: replace existing region wholesale, else insert before </body> ---

const regionRe = /<!--\s*client-review:injected\s*-->[\s\S]*?<!--\s*\/client-review:injected\s*-->/i;

if (regionRe.test(html)) {
  html = html.replace(regionRe, region);
} else {
  const bodyCloseRe = /<\/body\s*>/i;
  if (bodyCloseRe.test(html)) {
    html = html.replace(bodyCloseRe, `${region}\n</body>`);
  } else {
    html = html + '\n' + region + '\n';
  }
}

// --- determine output path ---

let outputPath;
if (inPlace) {
  outputPath = inputFile;
} else if (outFlag !== null) {
  outputPath = outFlag;
} else {
  const { dir, name } = parsePath(inputFile);
  outputPath = join(dir || '.', `${name}.commented.html`);
}

// --- write ---

try {
  writeFileSync(outputPath, html, 'utf8');
} catch (err) {
  opError(`could not write "${outputPath}": ${err.message}`);
}

process.stdout.write(outputPath + '\n');
process.exit(0);
