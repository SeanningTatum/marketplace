# AGENTS.md

Guidance for any coding agent working in this repository. [CLAUDE.md](./CLAUDE.md)
holds the full conventions (layout, the two-manifest model, versioning, how to add
plugins/skills, and the required per-skill README format) — read it first; everything
there applies here. This file only covers what differs or matters across tools.

## What this repo is

A dual-tool plugin marketplace: the same plugins are consumable by both
**Claude Code** (`/plugin`) and **Kimi Code CLI** (`/plugins`). No build step, no
runtime, no tests — the product is the skills.

## Dual-manifest rule

Every plugin carries two manifests that must stay in sync (name, description):

- `plugins/<name>/.claude-plugin/plugin.json` — Claude Code
- `plugins/<name>/kimi.plugin.json` — Kimi Code (`skills: "./skills/"`)

Two more manifests live at the repo root:

- `kimi.plugin.json` — exposes all three plugins' skills as one `sean-skills`
  plugin, so `/plugins install https://github.com/SeanningTatum/marketplace` works
  without cloning. Update its `skills` list when a plugin is added or removed.
- `kimi-marketplace.json` — Kimi custom-marketplace catalog (`version: "2"`) for
  per-plugin installs from a local clone. Add/remove entries alongside
  `.claude-plugin/marketplace.json`.

## Portable skill paths

Never use `${CLAUDE_PLUGIN_ROOT}` in a `SKILL.md` body — Kimi doesn't expand it.
Reference helper scripts/templates relative to the skill's own directory
(`<skill-dir>/…`, the directory containing that SKILL.md) and note both expansions
once (`${CLAUDE_PLUGIN_ROOT}/skills/<skill>` / `${KIMI_SKILL_DIR}`). See
`plugins/engineering-toolkit/skills/client-review/SKILL.md` for the pattern.

Kimi's directory-form parser requires `name` **and** `description` in SKILL.md
frontmatter — always include both, even for placeholders.

## Validation

- Claude Code: `claude plugin validate .` (run before committing, per CLAUDE.md).
- Kimi Code: install locally and check diagnostics —
  `/plugins install ./plugins/<name>` then `/plugins info <name>`.
  There is no standalone Kimi validator; diagnostics surface in `/plugins info`.
