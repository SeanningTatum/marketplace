#!/usr/bin/env node
// client-review / read.mjs
// Parse a client-review HTML doc's baked-in #brain-comments blob into markdown.
//
// Usage: node read.mjs <file.html>
//
// Exit codes: 0 success, 1 operational error, 2 usage error.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

function usageError(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.stderr.write('usage: node read.mjs <file.html>\n');
  process.exit(2);
}

function opError(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

// --- arg parsing (no flags accepted, exactly one positional file) ---

const args = process.argv.slice(2);
if (args.length === 0) usageError('missing required argument <file.html>');
if (args.some((a) => a.startsWith('-'))) {
  usageError(`unknown flag: ${args.find((a) => a.startsWith('-'))}`);
}
if (args.length > 1) usageError(`unexpected extra argument(s): ${args.slice(1).join(' ')}`);

const inputFile = args[0];

// --- read file ---

let html;
try {
  html = readFileSync(inputFile, 'utf8');
} catch (err) {
  opError(`could not read "${inputFile}": ${err.message}`);
}

// --- extract the #brain-comments script tag ---
// Robust to attribute order/whitespace: scan all <script ...>...</script>
// blocks and match by the id="brain-comments" attribute, not tag position.

function extractCommentsBlockText(source) {
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const idRe = /\bid\s*=\s*(['"])brain-comments\1/i;
  let match;
  while ((match = scriptRe.exec(source)) !== null) {
    const attrs = match[1] || '';
    if (idRe.test(attrs)) {
      return match[2];
    }
  }
  return null;
}

const blockText = extractCommentsBlockText(html);
if (blockText === null) {
  opError('no #brain-comments block found — is this a client-review document?');
}

// --- parse JSON, tolerating the older bare-array form ---

let parsed;
try {
  parsed = JSON.parse(blockText.trim());
} catch (err) {
  opError(`malformed #brain-comments JSON: ${err.message}`);
}

let comments;
if (Array.isArray(parsed)) {
  comments = parsed;
} else if (parsed && Array.isArray(parsed.comments)) {
  comments = parsed.comments;
} else {
  comments = [];
}

// --- doc title ---

function extractTitle(source) {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(source);
  if (!m) return null;
  const text = m[1].replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

const title = extractTitle(html) || basename(inputFile);

// --- sort: order asc, then at asc; missing order sorts last; stable ---

function sortKey(c, idx) {
  return { idx, order: typeof c.order === 'number' ? c.order : Infinity, at: c.at || '' };
}

const withKeys = comments.map((c, i) => ({ c, k: sortKey(c, i) }));
withKeys.sort((a, b) => {
  if (a.k.order !== b.k.order) return a.k.order - b.k.order;
  if (a.k.at !== b.k.at) return a.k.at < b.k.at ? -1 : 1;
  return a.k.idx - b.k.idx; // stable fallback
});
const sorted = withKeys.map((w) => w.c);

// --- formatting helpers ---

function fmtDate(iso) {
  if (!iso) return 'unknown time';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function truncateOneLine(text, max = 60) {
  const oneLine = String(text || '').replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max).trimEnd() + '…';
}

function fmtAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object') return 'unknown · (no anchor)';
  switch (anchor.type) {
    case 'element':
      return `element · \`${anchor.selector || 'unknown'}\``;
    case 'text': {
      const quote = truncateOneLine(anchor.quote, 60);
      return `text · "${quote}"`;
    }
    case 'image': {
      const sel = anchor.selector || 'unknown';
      const x = anchor.x !== undefined ? anchor.x : '?';
      const y = anchor.y !== undefined ? anchor.y : '?';
      return `image · ${sel} @ ${x}%,${y}%`;
    }
    case 'pin': {
      const sel = anchor.selector || 'unknown';
      const x = anchor.x !== undefined ? anchor.x : '?';
      const y = anchor.y !== undefined ? anchor.y : '?';
      const snip = anchor.snippet ? ` (near "${truncateOneLine(anchor.snippet, 40)}")` : '';
      return `pin · ${sel} @ ${x}%,${y}%${snip}`;
    }
    default:
      return `${anchor.type || 'unknown'} · (unrecognized anchor)`;
  }
}

// --- emit markdown ---

const lines = [];
lines.push(`# Client comments — ${title}`);
lines.push('');

if (sorted.length === 0) {
  lines.push('0 comments');
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

// Resolve was removed from the UI; only mention it for legacy files that
// still carry resolved comments.
const resolvedCount = sorted.filter((c) => c.status === 'resolved').length;
const plural = sorted.length === 1 ? 'comment' : 'comments';

lines.push(resolvedCount > 0
  ? `${sorted.length} ${plural} — ${resolvedCount} resolved`
  : `${sorted.length} ${plural}`);
lines.push('');

// Indent continuation lines of a multi-line body so it stays inside its
// markdown list item. Without this, a comment like "First.\n\nSecond." breaks
// out of the list and parsers (and agent consumers) drop the continuation.
const indentBody = (body, pad) => String(body || '').replace(/\n/g, `\n${pad}`);

sorted.forEach((c, i) => {
  const n = i + 1;
  const bodyPreview = truncateOneLine(c.body, 60);
  const statusTag = c.status === 'resolved' ? ' · resolved' : '';
  lines.push(`## ${n}${statusTag} · "${bodyPreview}"`);
  lines.push(`- anchor: ${fmtAnchor(c.anchor)}`);
  const author = c.author || 'unknown';
  const role = c.role || 'unknown';
  lines.push(`- by: ${author} (${role}) · ${fmtDate(c.at)}`);
  lines.push(`- comment: ${indentBody(c.body, '  ')}`);
  if (Array.isArray(c.replies)) {
    for (const r of c.replies) {
      const rAuthor = r.author || 'unknown';
      const rRole = r.role || 'unknown';
      lines.push(`  - ↳ reply · ${rAuthor} (${rRole}) · ${fmtDate(r.at)}: ${indentBody(r.body, '    ')}`);
    }
  }
  lines.push('');
});

process.stdout.write(lines.join('\n').replace(/\n+$/, '\n'));
process.exit(0);
