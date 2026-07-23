---
name: mockup-screenshot
description: Generate a labeled, illustrative "example output" SVG mockup (a colorized terminal transcript or a browser-window screenshot) for a README or doc when there's no real screenshot to capture — e.g. a CLI skill with no live demo environment, or a feature that needs cloud resources/auth to actually run. Use when asked to "add a screenshot", "mock up the output", "make an example-output image", "show what this looks like", or invokes /mockup-screenshot. Do NOT use this when a real screenshot can actually be captured (a running app, a deployed preview) — always prefer a real capture over a mockup.
user-invocable: true
---

# mockup-screenshot

Produces a fake-but-convincing "example output" image for documentation —
either a colorized terminal transcript or a browser-window screenshot — when
the real thing (an actual CLI run, an actual deployed page) can't be captured
in the current context. Every mockup is visibly labeled so nobody mistakes it
for a real capture.

**Always prefer a real screenshot when one is obtainable.** This skill exists
for the case where a skill/feature has no live environment to screenshot
(no server, no deployed app, requires cloud auth/billing) — not as a shortcut
around actually running something you could run.

## When to use

- Writing a README for a skill/tool that has no capturable live demo.
- "Add a screenshot to this doc" when there's nothing running to screenshot.
- Illustrating a multi-step CLI flow (a triage table, a pass/fail sequence)
  more legibly than prose would.

## Two mockup types

### 1. Terminal transcript (parameterized — use this by default)

A macOS-style terminal window rendered from a JSON line spec. This is a
generator, not freehand drawing — write the spec, run the CLI, get the SVG.

**Spec format** (see `examples/sample.spec.json`):

```json
{
  "title": "/your-skill — one-line description of the flow",
  "width": 900,
  "lines": [
    "a plain line, default color",
    [{ "t": "colored/bold span", "c": "green", "b": true }, { "t": " plain span" }]
  ]
}
```

- `lines[]`: each entry is either a plain string, or an array of spans
  `{ t: text, c?: color, b?: bold }`. Use `""` for a blank spacer line.
- Colors (`c`): `text` (default), `dim`, `green`, `red`, `yellow`, `blue`,
  `magenta`, `cyan` — reserve `red` for P1/failure, `green` for
  success/P3, `yellow` for P2/warnings, `blue` for links, `magenta` for the
  `$` prompt, `dim` for secondary/muted detail.
- Keep lines under ~85 characters — the rendered width is fixed (`width`,
  default 900px) and long lines clip rather than wrap.

**Generate:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/mockup-screenshot/lib/terminal-mockup.mjs <spec.json> -o example-output.svg
```

Or import it directly in a throwaway script for anything the CLI doesn't cover
(`import { buildTerminalSVG } from ".../lib/terminal-mockup.mjs"`).

### 2. Browser window (freehand — start from the template)

For mocking up a web page, comment UI, or anything that isn't a terminal.
There's no generator here — page content is too varied to parameterize
usefully. Instead:

1. Copy `lib/browser-mockup-template.svg` to your target path.
2. Keep the chrome block (traffic lights, address bar, "example output"
   watermark) unchanged except the address-bar URL text.
3. Replace the placeholder content block with real `<text>`/`<rect>`/`<circle>`
   primitives — draw the actual UI (cards, form fields, avatars, whatever the
   real feature shows). Information-dense and labeled, not abstract shapes.

## Always verify by rendering

SVG that looks right in source can clip or overflow when rendered. Before
treating a mockup as done, render it and look:

```bash
# headless Chrome (works anywhere Chrome is installed)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --screenshot=check.png --window-size=<width+40>,<height+80> \
  "file:///absolute/path/to/example-output.svg"
```

Read the resulting PNG back (the Read tool renders images). If text clips at
the right edge, shorten the offending lines rather than widening
indefinitely — a wide image is worse for a README than a tight one.

## Rules

- **Every mockup must say "example output"** in the title bar/corner — the
  generator does this automatically; don't remove it from a hand-edited
  browser mockup either.
- **Caption it as illustrative** in the surrounding doc — e.g. *"Illustrative
  mockup of a typical run — your output will differ."* Never let a mockup
  pass as a real screenshot.
- **Prefer a real capture whenever one is possible.** Mock up only when there
  genuinely is nothing to capture (no server, no deploy, needs billing/auth
  you don't have).
- **Verify by rendering** before committing — don't ship an SVG you haven't
  visually checked.
