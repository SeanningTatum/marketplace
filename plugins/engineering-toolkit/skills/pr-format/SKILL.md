---
name: pr-format
description: Format a pull request description for maximum readability using a fixed, thought-through structure — WHY, WHAT, HOW, SOLUTION, VERIFICATION, CAVEATS, NEXT STEPS. Use when opening a PR, writing/rewriting a PR description or body, asked to "format this PR", "write the PR description", or invokes /pr-format.
user-invocable: true
---

# pr-format

Produce a pull request description that a reviewer can read top-to-bottom and
fully understand *why* the change exists, *what* it does, *how* it works, and
*that it was verified* — without opening the diff first.

Readability is the goal. Every section earns its place or gets dropped. Prose
over walls of text. A reviewer skimming on a phone should still get the story.

## When to use

- Opening a new PR (fill the body from the template below).
- Rewriting a thin/auto-generated PR description into a reviewable one.
- User asks to "format this PR", "write the PR body", or runs `/pr-format`.

## The structure

Seven sections, always this order. Use `##` headings. Omit a section only when
it genuinely does not apply (see Rules) — never leave an empty heading.

```markdown
## Why
The problem, in one or two sentences. What was broken, missing, or slow — and
who it hurt. Link the issue/ticket. This is the section reviewers read first;
make it land.

## What
The change, from the outside. Bullet the user- or API-visible differences.
No implementation detail here — a PM should follow it.

- Added X so users can Y
- Changed Z from A to B
- Removed the deprecated Q path

## How
The change, from the inside. The approach and the *key decisions*, not a
line-by-line diff narration. Name the files/modules that carry the weight and
say why the approach was chosen over the obvious alternative.

## Solution
Why this is the *right* fix, not just *a* fix. Root cause addressed vs. symptom
patched. If it's a targeted workaround, say so plainly and say why the full fix
was out of scope.

## Verification
Proof it works. Concrete, reproducible.

- Tests: what was added/run, and the result (`42 passed`)
- Manual: exact steps to reproduce the check
- Screenshots / recordings: before → after for any UI change
- Perf/data: numbers if the PR claims a speedup or size change

## Caveats
Honest risk surface. Known limitations, edge cases not covered, breaking
changes, migrations required, feature flags, rollback plan. What a reviewer
should push back on. "None" is a valid answer — but only after you looked.

## Next steps
Follow-up work this PR intentionally defers. Link tickets. Distinguishes
"not done because out of scope" from "forgot".
```

## Rules

- **Why is mandatory and comes first.** If you can't state why, the PR isn't ready.
- **What ≠ How.** *What* is observable behavior; *How* is mechanism. Do not merge them.
- **Verification is not optional for behavior changes.** Code that changes runtime
  behavior always has something to observe — show it. Docs/comment/rename-only
  PRs may state "No runtime change; N/A" and skip the proof.
- **Screenshots for every UI change**, before→after. A UI PR with no image is incomplete.
- **Omit, don't pad.** If Caveats or Next steps are truly empty, drop the section
  rather than writing filler — but write "None — checked X, Y, Z" for Caveats when
  the check itself is the reassurance a reviewer needs.
- **Prose density matches the change.** A one-line fix gets a tight three-section
  body (Why / What / Verification). A feature gets all seven. Don't ceremony-fill.
- **Link everything linkable** — issues, tickets, related PRs, design docs, dashboards.
- **Write in the imperative/declarative, past-neutral voice.** "Adds retry to the
  upload path", not "I added...". Match the repo's existing PR voice if it has one.

## Workflow when generating a PR body

1. Read the diff (`git diff <base>...HEAD`) and the commit messages — derive What/How from it, don't ask.
2. Find the linked issue/ticket for Why; if none, ask the user for the one-line why.
3. Run/collect verification: check for a test command in the repo, run it, capture the result. For UI, ask for or capture screenshots.
4. Fill the template. Drop sections per Rules. Keep it skimmable.
5. Output the markdown body ready to paste, or create the PR with `gh` (below).

## Creating the PR with GitHub CLI

Preferred path when the repo has a GitHub remote and `gh` is available.

1. **Preflight:**
   - `gh auth status` — confirm authenticated. If not, tell the user to run `! gh auth login` and stop.
   - `git remote -v` — confirm a GitHub remote exists.
   - `git status --short` — surface uncommitted changes. Commit or stash before opening the PR; don't open a PR against a dirty tree without saying so.
2. **Branch:** never open a PR from the default branch (`main`/`master`). If on it, create a branch first (`git switch -c <descriptive-name>`), then commit.
3. **Push:** `git push -u origin <branch>` (set upstream on first push).
4. **Write the body to a file** — do not inline a multi-line body on the command line (quoting/newlines break). Write the formatted markdown to a temp file, then:
   ```bash
   gh pr create --base <base> --head <branch> \
     --title "<concise imperative title>" \
     --body-file <path-to-body.md>
   ```
   Add `--draft` if the change isn't review-ready. Add `--reviewer <user>` / `--label <label>` when the user names them.
5. **Confirm before creating** — a PR is outward-facing. Show the user the final title + body and the exact `gh` command, get a go-ahead, then run it. Report the returned PR URL.
6. Attaching screenshots: `gh` can't upload images to a PR body. Note where the UI images go and let the user drag them into the PR, or reference an already-hosted URL.

## Minimal example (small fix)

```markdown
## Why
Uploads over 5 MB failed silently — the client never saw an error. (#812)

## What
- Upload errors now surface a toast with the failure reason
- Retries transient 5xx once before giving up

## Verification
- `npm test upload` → 7 passed
- Manual: throttled to 3G, uploaded 8 MB file → saw retry then success toast

## Caveats
None — retry is capped at 1 and only on 5xx, so no risk of amplifying load.
```
