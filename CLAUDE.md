# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **Claude Code plugin marketplace** — a git-hosted catalog of Sean's personal
plugins, focused on SaaS engineering and automations. It is not an application:
there is no build step, no runtime, and no test framework. The "product" is the
set of plugins (skills, agents, hooks, MCP servers) that other Claude Code
installs consume via `/plugin`.

Users add the marketplace with `/plugin marketplace add <owner>/<repo>` and
install plugins with `/plugin install <plugin>@sean-skills`.

## Layout

```
.claude-plugin/marketplace.json   ← the catalog: lists every plugin + where to find it
plugins/<plugin>/                 ← one directory per plugin (this is the "plugin root")
  .claude-plugin/plugin.json      ← that plugin's manifest (name = skill namespace)
  skills/<skill>/SKILL.md         ← a skill: frontmatter + instructions
```

Everything except `plugin.json` lives at the **plugin root**, never inside
`.claude-plugin/`. So `skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`,
`settings.json`, `bin/` all sit next to `.claude-plugin/`, not within it. This
is the single most common structural mistake and it silently breaks loading.

Marketplace `source` paths are relative to the **marketplace root** (repo root),
not to `.claude-plugin/` — hence `"./plugins/engineering-toolkit"`.

## The two-manifest model

Two JSON files drive everything; keep them consistent:

- **`marketplace.json`** — the catalog. Each `plugins[]` entry needs `name` +
  `source`. `name` is public and permanent: users reference it in
  `/plugin install <name>@sean-skills` and in their settings, so renaming it
  breaks every existing install (use a top-level `renames` map if you must —
  see the marketplace docs).
- **`plugin.json`** — per-plugin identity. Its `name` is the **skill namespace**:
  a skill `hello` in plugin `engineering-toolkit` is invoked as `/engineering-toolkit:hello`.
  Changing it changes every skill's invocation name.

`name` values are kebab-case, lowercase, no spaces (the claude.ai sync rejects
other forms even though the CLI tolerates them).

## Versioning

Plugins here intentionally **omit `version`**, so the git commit SHA is the
version and every pushed commit is a new version for users — the simplest model
for an actively-developed personal marketplace. The validator warns about the
missing field; that warning is expected, ignore it.

If you add an explicit `version`, you must bump it on every release or users
never receive updates (Claude Code sees the same version string and keeps the
cached copy). Set it in **one** place — `plugin.json` wins over the marketplace
entry silently, so a stale `plugin.json` version masks the marketplace one.

## Working in this repo

Validate after any change to `marketplace.json` or a plugin — this is the only
check that exists here, so run it before committing:

```bash
claude plugin validate .                       # validate the marketplace catalog
claude plugin validate ./plugins/engineering-toolkit  # validate one plugin (frontmatter, hooks, etc.)
```

Test a plugin locally without installing:

```bash
claude --plugin-dir ./plugins/engineering-toolkit
/reload-plugins   # pick up edits without restarting
```

## Adding a plugin

1. `plugins/<name>/.claude-plugin/plugin.json` with `name` + `description`.
2. Components at the plugin root (`skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`).
3. Add a `plugins[]` entry to `.claude-plugin/marketplace.json` with a
   `"./plugins/<name>"` source.
4. `claude plugin validate .`, then commit.

## Adding a skill

Create `plugins/<plugin>/skills/<skill-name>/SKILL.md`. The directory name is the
skill name. Frontmatter must include a `description` — Claude reads it to decide
when to auto-invoke the skill, so make it specific about *when* to use the skill,
not just what it does. Use `$ARGUMENTS` in the body to capture user input passed
after the skill name. Reference files inside hooks/MCP configs with
`${CLAUDE_PLUGIN_ROOT}` — plugins are copied to a cache on install, so absolute
and `../` paths break.

The `plugins/*/skills/example-skill/` directories are placeholders; replace or
delete them as real skills land.
