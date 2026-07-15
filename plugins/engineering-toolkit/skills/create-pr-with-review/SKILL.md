---
name: create-pr-with-review
description: Open a pull request that has already been through an AI review. Runs the Greptile CLI on the current branch first, resolves the findings by a P1/P2/P3 ruleset (P1 escalates to a human, P2/P3 auto-fix), then formats and creates the PR. Use when asked to "open a PR with review", "review then PR", "ship this with Greptile", or invokes /create-pr-with-review.
user-invocable: true
---

# create-pr-with-review

Ship a branch as a pull request that is *already clean*: review the diff with
the Greptile CLI **before** the PR exists, resolve what's safe to resolve, hand
the risky calls to a human, and only then open the PR. Reviewers see a PR that
has had a pass already — not a first draft.

Order is fixed: **review → resolve → create PR.** Never open the PR first.

`$ARGUMENTS` may carry extra review focus (passed to Greptile as
`--instructions`) and/or a base branch. If empty, review against the repo
default base.

## When to use

- "Open a PR with a review first" / "review then PR" / "ship this with Greptile".
- Runs `/create-pr-with-review`.

For resolving comments on an **already-open** PR, use `/resolve-comments`. For
writing a PR body without the review step, use `/pr-format`.

## Preflight (stop on any failure)

1. **Greptile CLI present:** `greptile --version`. If missing:
   `npm i -g greptile` (or `brew install greptile`), then continue.
2. **Signed in:** `greptile whoami`. If it prints "Not signed in", stop and tell
   the user to run `! greptile login` (browser/interactive — you cannot do it
   for them), then re-invoke.
3. **`gh` auth:** `gh auth status`. If not authed, tell the user to run
   `! gh auth login` and stop.
4. **GitHub remote exists:** `git remote -v`.
5. **Not on the default branch:** if on `main`/`master`, create a branch first
   (`git switch -c <descriptive-name>`).
6. **Changes are committed:** `git status --short`. Commit the work to review
   before running Greptile — the CLI reviews the committed branch diff vs base.

## Workflow

### 1. Review with Greptile (before the PR)

Run the CLI against the base branch and capture findings as JSON:

```bash
greptile review --json ${BASE:+-b "$BASE"} ${FOCUS:+--instructions "$FOCUS"}
```

- `--json` gives machine-parseable findings; parse them, don't eyeball.
- `--branch/-b` sets the base (omit for repo default).
- `--instructions` carries any focus from `$ARGUMENTS` (e.g. "focus on the auth
  changes").
- If a review is interrupted, `greptile review --resume` continues it.
- Greptile may hold back sensitive files (`.env`, keys); only add them with
  `--include` if the user explicitly asks.

Print a findings summary before touching code.

### 2. Resolve findings by the P1/P2/P3 ruleset

Triage every finding into exactly one priority. **When in doubt, escalate up.**
This is the same ruleset as `/resolve-comments`:

- **P1 — human in the loop.** Security/auth/secrets/crypto, payments/billing,
  data migrations or destructive ops, breaking API/contract changes,
  architecture/design disagreements, ambiguous/speculative findings, or
  anything needing broad changes. **Do not auto-apply.** Collect all P1 items
  and present them with `AskUserQuestion` (comment + file:line + 2–3 concrete
  options each); wait for the decision.
- **P2 — auto-fix, then show.** Clear, bounded, single-concern change with an
  unambiguous fix and no P1 trigger. Apply it, then show the batched diff before
  committing.
- **P3 — auto-fix silently.** Trivial, zero-judgment (typos, lint, formatting,
  stray logs, explicit renames). Apply directly.

Print the triage table (finding → file:line → priority → planned action) before
editing.

### 3. Apply, verify, commit

- Apply P3 silently; apply P2 and collect diffs; act on P1 only per the human's
  decision.
- Re-run the repo's test/lint command after edits.
- Commit the fixes with a message that references the pre-PR review (e.g.
  `fix: address Greptile review findings`).

### 4. Create the PR

- Build the body with the **`/pr-format`** structure (Why / What / How /
  Verification / Caveats / Next steps). Note in Verification that a Greptile
  review ran pre-PR and how findings were handled (N auto-fixed, M escalated).
- Push: `git push -u origin <branch>`.
- **Confirm before creating** — show the final title + body and the exact `gh`
  command, get a go-ahead, then:
  ```bash
  gh pr create --base <base> --head <branch> \
    --title "<concise imperative title>" --body-file <body.md>
  ```
- Report the returned PR URL.

## Final summary

Report: Greptile findings count, triage breakdown (P1/P2/P3), what was
auto-fixed vs escalated and the human's P1 decisions, the fix commit SHA, and
the created PR URL.

## Rules

- **Review before PR — always.** The whole point is a pre-reviewed PR; never
  invert the order.
- **Never auto-apply a P1.** Escalation is mandatory.
- **Triage table before edits.** The human sees the plan before code moves.
- **Confirm before creating the PR** — it is outward-facing.
- **Stay in scope** — fix what Greptile flagged; don't refactor adjacent code.
- **Don't force-push** a shared branch without asking.
