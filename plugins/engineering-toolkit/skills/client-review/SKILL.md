---
name: client-review
description: Turn any HTML doc into a self-contained, offline commentable artifact for a client to review, then read their comments back as markdown for agents. Use when the user wants a client/stakeholder to comment on a generated document and send feedback back.
---

# client-review

Turns any HTML document we generate (report, plan, proposal) into a single-file,
offline, commentable artifact for a non-technical client. They open it by
double-click, leave comments, and export — no server, no account, no install.
We then convert their returned file into markdown for our working agents.

## Round trip

1. **Build** — author or take an existing HTML doc, then inject the annotation layer:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/skills/client-review/inject.mjs <doc.html> [-o out.html]
   ```
   Default output is `<name>.commented.html` next to the source. This step is
   **idempotent** — running it again (including on a file the client already
   returned) preserves any existing comments and just ensures the layer/assets
   are current. Safe to re-run.

2. **Send** — the output is one self-contained file (HTML + inline CSS/JS +
   comments data). Email or share it as-is. Nothing else to ship, no assets,
   no links.

   The file carries a **stage** on `<html data-cr-stage="...">`: `draft`
   (fresh from inject — the client stage) or `returned` (a file the client
   exported — the reviewer stage). The client's Export flips the stage, so the
   round-trip is automatic; you never set it by hand.

3. **Comment (client stage — `draft`)** — what the client experiences:
   - A floating button toggles **comment mode** on/off.
   - In comment mode, a segmented control switches between two capture modes:
     - **Highlight** (default): hover outlines the element under the cursor;
       click a block to comment on it (the block stays highlighted), or select
       a text range to comment on that exact passage. Mirrors the brain-axi
       plan-review annotation feel.
     - **Free pin**: crosshair cursor; click *anywhere* to drop a pin at that
       exact spot (anchored element-relative, so it survives resize/reflow).
   - A right-side rail lists every comment; click one to jump to its anchor.
   - The client can **edit or delete their own** comments. No replies here.
   - They're asked for their name once (first comment), remembered per device.
   - **Export** bakes their comments in AND stamps the file
     `data-cr-stage="returned"`, then downloads it. They send that file back.

4. **Reply (reviewer stage — `returned`)** — when YOU open the file they sent:
   - It opens reply-only: comment-adding is off, the rail is the surface.
   - You can **Reply** to each client comment (your reply is role `reviewer`),
     but you **cannot edit or delete** the client's comments — only your own
     replies. You're asked for your name once (stored as the reviewer).
   - The rail's export button becomes **Export markdown**: it renders the whole
     document as markdown with every comment + your replies interleaved, copies
     it to your clipboard (and downloads a `.md`), so you can paste the review
     straight to the client.

5. **Read (for agents)** — convert any returned file to markdown on the CLI:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/skills/client-review/read.mjs <returned.html>
   ```
   Prints comment markdown to stdout — pipe to a file or straight into the next
   agent's context. Each comment appears anchored (element/text/image/pin),
   authored, timestamped, with replies nested. (This is the agent-facing path;
   the in-browser **Export markdown** above is the client-facing one.)

## Data model

All comments live in exactly one blob, nothing else is read or scraped:

```html
<script type="application/json" id="brain-comments">
{"schema":"client-review/1","comments":[...]}
</script>
```

`read.mjs` parses **only** this blob — it never scrapes rendered DOM/highlight
markup, so it's robust to whatever the client's browser did to the rest of
the page. Anchor types you'll see referenced per comment:

- `element` — anchored to a specific block (section, paragraph, list item).
- `text` — anchored to a text range/selection within a block.
- `image` — pinned to a specific image (with x/y coordinates on it).
- `pin` — a free pin dropped in Pin mode: nearest element `selector` + x/y%
  offset within it, plus a `snippet` of nearby text for context.

## Authoring a fresh doc

Start from the starter template:
```
${CLAUDE_PLUGIN_ROOT}/skills/client-review/template.html
```
It is a plain, uninjected HTML doc (warm editorial style, placeholder
content) — edit its content for the real doc, then run `inject.mjs` on it
per the Build step above. The template does not ship pre-injected; always
run inject.mjs as the last authoring step so the layer matches the final
content.

## Notes / limits

- Offline only — no network calls, no accounts, nothing phones home.
- The document body must not change between send and return; the client's
  browser only adds comments, it doesn't re-render your content. If you need
  to revise the doc itself, re-author and re-inject a fresh copy instead of
  editing a returned file's content.
- If a client returns multiple versions, the latest returned file wins —
  read that one; don't try to merge comment sets from different returns.
