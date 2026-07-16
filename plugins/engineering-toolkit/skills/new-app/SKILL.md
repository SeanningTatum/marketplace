---
name: new-app
description: Scaffold a new application from the cf-saas-starter-react-router template. Creates a brand-new GitHub repository from the template on the remote, clones it locally, seeds the app's AGENTS.md (which CLAUDE.md symlinks to) with the app name and description, then hands off the interactive `bun setup` wizard. Use when asked to "create a new app", "scaffold a new project", "start a new SaaS app", "spin up a new app from the template", or invokes /new-app.
user-invocable: true
---

# new-app

Scaffold a brand-new application from the
[`cf-saas-starter-react-router`](https://github.com/SeanningTatum/cf-saas-starter-react-router)
template. The skill creates a **new GitHub repository from the template** on the
remote (GitHub's template feature — fresh single-commit history, its own repo,
no fork link), clones it locally with `origin` already wired, seeds the app's
context docs with the new app's name + description, then hands off the Cloudflare
setup wizard for the user to run interactively.

Template stack: Cloudflare Workers + React Router v7 + tRPC + D1/Drizzle +
Better Auth + Effect TS + ShadCN/Tailwind, with a `.brain/` agent harness.

## Inputs

Collect these before doing anything. `$ARGUMENTS` may contain the app name
(and, after a `--` or dash, a description) — parse what's there, then ask for
whatever is missing:

- **App name** (required) — kebab-case, lowercase, no spaces. This becomes the
  new GitHub repo name, the local directory name, and the Cloudflare project
  name. If the user gave a name with other casing/spaces, sanitize it
  (lowercase, spaces → `-`) and confirm.
- **Description** (optional) — one sentence on what the app is. If omitted,
  proceed without it; do not block. Passed to `gh repo create --description`.
- **Visibility** (required by `gh repo create`) — `private` or `public`.
  Default to **private**; confirm with the user before creating a public repo.
- **Owner** (optional) — a GitHub org/user to own the new repo. Defaults to the
  authenticated user. To target an org, create the repo as `<owner>/<app-name>`.

If the app name is missing, ask for it (with description + visibility as
follow-ups) using AskUserQuestion — do not invent a name.

## Steps

Run these in order. Stop and report if any step fails; do not silently continue.

### 1. Pre-flight

- Confirm `git`, `gh`, and `bun` are on PATH (`git --version`, `gh --version`,
  `bun --version`). If `bun` is missing, tell the user to install it
  (https://bun.sh) and stop.
- Confirm `gh` is authenticated: `gh auth status`. If not, tell the user to run
  `! gh auth login` and stop — you cannot authenticate for them.
- Confirm the target directory does not already exist. The clone lands in the
  current working directory by default (`./<app-name>`). If `<app-name>/`
  already exists, stop and ask — never clobber.

### 2. Create the repo from the template + clone

Use GitHub's template feature to create a **new remote repo** from the template
and clone it in one step. This gives the app its own repo with a fresh
single-commit history and `origin` already pointing at the new repo — no fork
link, no manual history reset.

```bash
gh repo create <app-name> \
  --template SeanningTatum/cf-saas-starter-react-router \
  --private \
  ${DESCRIPTION:+--description "<description>"} \
  --clone
```

- Swap `--private` for `--public` only when the user chose public.
- To create under an org, use `<owner>/<app-name>` as the name.
- `--clone` clones into `./<app-name>`. `origin` is the new repo, not the
  template.
- The template repo must be marked as a **template repository** on GitHub for
  `--template` to work; if `gh` reports it is not a template, stop and tell the
  user to enable *Settings → Template repository* on
  `SeanningTatum/cf-saas-starter-react-router`.

Do **not** commit or push yet — `bun setup` (step 4) writes `wrangler.jsonc`,
`.env`, and other generated files, and installing deps configures git hooks
(`core.hooksPath .githooks`). Let the user make the first commit after setup so
those land in it.

### 3. Update the app context docs

The template's context lives in `AGENTS.md`. **`CLAUDE.md` is a symlink to
`AGENTS.md`** — edit `AGENTS.md` only, and never replace the symlink with a
real file (that would desync the two and break the harness).

`AGENTS.md` opens with an `## Overview` paragraph describing the *starter*.
Replace that paragraph so it describes *this* app instead, while preserving the
"Brain Pointer" header, the retrieval note, and everything below (the
read-before-task workflow, `.brain/` structure, etc.). Keep the stack line —
just reframe it as this app's stack.

Target shape for the top of `AGENTS.md`:

```markdown
# AGENTS.md — Brain Pointer

> This is the single source of truth. `CLAUDE.md` is a symlink to this file, so Claude Code, Cursor, Codex, Aider all read the same content. **Edit `AGENTS.md` only** — never replace the symlink with a real file. All real content lives under [`.brain/`](.brain/).

## Overview

**<app-name>** — <description, if provided>.

Built on the Cloudflare SaaS stack: **Cloudflare Workers + React Router v7 + tRPC + D1/Drizzle + Better Auth + Effect TS + ShadCN/Tailwind**.

> **Retrieval over recall.** ...(leave the rest of the file unchanged)
```

If no description was given, write just the name line and the stack line — do
not fabricate a description.

Verify `CLAUDE.md` is still a symlink afterward — from inside the new app dir,
`ls -l CLAUDE.md` should show `CLAUDE.md -> AGENTS.md`.

### 4. Hand off `bun setup`

`bun setup` is an **interactive** first-time wizard that logs into Cloudflare,
creates real cloud resources (D1 database, R2 bucket, optional KV), generates a
`BETTER_AUTH_SECRET`, writes `wrangler.jsonc` + `.env`, runs migrations, and
deploys. It has no non-interactive mode and it provisions billable resources —
so **the user runs it themselves**, do not run it in the background.

Tell the user to run, from inside the new directory:

```bash
cd <app-name>
bun install
bun setup
```

Note for them: the wizard will prompt for the project name (default derived from
the directory — `<app-name>` is fine), whether to enable R2 file storage, and a
confirmation of the generated resource names. It requires a logged-in Cloudflare
account (`wrangler login`) and will create/deploy live resources.

## Done

Report to the user:

- The new GitHub repo URL and its visibility (private/public).
- Where it was cloned locally (`./<app-name>`), with `origin` wired to the new
  repo. Nothing committed yet beyond the template's initial commit.
- That `AGENTS.md`/`CLAUDE.md` now describe the new app.
- The exact `bun install && bun setup` commands to run next, and that setup is
  theirs to run interactively because it touches their Cloudflare account.
