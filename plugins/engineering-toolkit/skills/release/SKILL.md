---
name: release
description: >
  Ship a merged-ready PR as a versioned release: squash-merge, pick the next
  semver tag, and publish a GitHub release with marketing-grade notes in this
  repo's established voice. Use when asked to "cut a release", "ship vX.Y.Z",
  "squash merge and tag", or "write release notes".
user-invocable: true
---

# release

Take a green PR to a published, branded GitHub release. Order is fixed:
**merge → version → notes → release.** Never draft notes against an unmerged
diff — the squash commit is the source of truth.

## 1. Preconditions (stop on any failure)

- PR exists, all CI checks pass (`gh pr checks <n>`), review threads resolved.
- You are told (or can infer) which PR to ship. Ambiguous → ask.
- `gh auth status` works and the working tree is clean.

## 2. Squash-merge

```bash
gh pr merge <n> --squash --delete-branch
default_branch=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
git switch "$default_branch" && git pull
git log --oneline -1   # record the squash SHA for the notes
```

## 3. Pick the version

- Versions live in **git tags only** (`git tag -l`) — there is no
  package.json version field to bump. Don't add one.
- Semver by content of the release, not size of the diff:
  - **minor** (v1.X.0) — new capability, new surface, behavior additions.
  - **patch** (v1.1.X) — fixes only, no new surface.
  - **major** — breaking change to something a downstream user consumes.
- Hardening/refactor releases that change behavior callers can observe
  (new auth requirements, changed response shapes) are **minor**, not patch.

## 4. Write the notes — house style

Study the two shipped examples before writing:
`gh release view v1.1.0` ("Every PR Gets Its Own SaaS") and
`gh release view v1.2.0` ("The Boilerplate Audited Itself").

The voice, distilled:

- **Title**: `vX.Y.Z — <hook>`. The hook is a claim, not a category —
  "Every PR Gets Its Own SaaS", never "Preview deployment support".
- **Open with one bold-faced paragraph** selling the outcome: what a user
  gets now that they didn't before. An emoji-led `##` header above it.
- **Sections are `###` with emoji bullets.** Each bullet: **bold claim**,
  em-dash, then the concrete mechanics (real flag names, real URLs, real
  file paths). Marketing up front, engineering right behind it.
- **A "Why it's different" or equivalent contrast section** when the release
  competes with an obvious alternative approach.
- **Always close with "For the agent-first crowd"** — what changed in the
  `.brain/` harness, CI gates, or agent workflow this release.
- **Hard-won gotchas get told as stories** ("Found the hard way: …") — one
  sentence of pain, one of fix, and note it's documented in the brain.
- **End with the compare link**:
  `**Full diff**: https://github.com/<owner>/<repo>/compare/<prev>...<new>`
- Numbers sell: test counts before/after, "~30 duplicated blocks gone".
  Never pad — every bullet must map to something real in the diff.

Write the body to a scratch file (`mktemp -d` gives a portable temp dir —
this skill runs in other installs, so don't assume any fixed path), don't
inline it in the command.

## 5. Publish

**Confirm before creating** — a release is outward-facing: it creates a tag,
fires webhooks, and notifies watchers, and is harder to retract than a PR.
Show the human the final title, hook line, and rendered notes, and get an
explicit go-ahead before running:

```bash
tmp=$(mktemp -d)
default_branch=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
# write notes to "$tmp/release-vX.Y.Z.md" first
gh release create vX.Y.Z --target "$default_branch" \
  --title "vX.Y.Z — <hook>" --notes-file "$tmp/release-vX.Y.Z.md"
```

`gh release create` creates the tag — don't pre-tag manually.

## 6. Close the loop

- This repo has **no tag-triggered production deploy**. If the user wants it
  live on Cloudflare, that's an explicit `bun run deploy` — ask, never run it
  as a side effect of releasing.
- Append the release to `.brain/CHANGELOG.md` and the progress log
  (`.brain/runs/progress.md`) with the tag, SHA, and one-line summary.
- Report: squash SHA, tag, release URL.

## Rules

- Merge before notes; notes describe what landed, not what was intended.
- Title hook is mandatory — a release named after its category is a changelog,
  not a release.
- Every marketing claim must be traceable to the diff. No vaporware bullets.
- Deploying to production is never implicit in "release".
