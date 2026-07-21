---
name: create-pr-with-review
description: Open a pull request that has already been through an AI review. For any user-visible change, first proves it works by driving the live app in a real browser with Playwright (delegated to cheaper worker sub-agents, repeated to defeat flakes, screenshots as evidence) and locks it in with committed regression + e2e tests. Then runs the Greptile CLI on the current branch, resolves the findings by a P1/P2/P3 ruleset (P1 escalates to a human, P2/P3 auto-fix), formats and creates the PR. Use when asked to "open a PR with review", "review then PR", "ship this with Greptile", or invokes /create-pr-with-review.
user-invocable: true
---

# create-pr-with-review

Ship a branch as a pull request that is *already clean*: review the diff with
the Greptile CLI **before** the PR exists, resolve what's safe to resolve, hand
the risky calls to a human, and only then open the PR. Reviewers see a PR that
has had a pass already — not a first draft.

Order is fixed: **verify → review → resolve → create PR.** For any user-visible
change, prove it works in a live browser and lock it in with tests *before* the
review; never open the PR first.

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

### 1. Verify the change in a live browser (any user-visible change)

For any change a user can see or interact with, prove it actually works in the
**real running app** (a deployed preview or a locally-served build) before you
review the diff. This phase is model-tiered so it stays cheap on cost and context:

- **You are the coordinator** — stay on a high-capability tier (**Opus** or
  **Fable**). Do **not** drive the browser yourself; your job is to delegate,
  cross-check, and synthesize the verdict.
- **Delegate the browser walk to cheaper workers.** Spawn worker sub-agents with
  the **Agent tool** on a **Sonnet** or **Haiku** tier. Give each the same brief:
  the app URL, the exact **golden path** steps, and **one error path**. Each
  worker drives the live app with Playwright (navigate, fill forms, click,
  snapshot) and takes a **screenshot at every key step**, saving them to a known
  evidence directory and returning a PASS/FAIL plus the screenshot paths.
- **Repeat to defeat flakes.** Launch the workers as **multiple independent runs
  (2–3), in parallel**, of the same walk — a single green run is not a PASS.
- **Synthesize.** Collect every worker's screenshots + step log. Report **PASS
  only if the independent runs agree.** If they diverge, treat it as FAIL, note
  the discrepancy, fix or re-run, and do not proceed. Attach the screenshots as
  the verification evidence (they also feed the PR's Verification section).

If nothing user-visible changed (pure refactor, internal helper, docs-only),
skip this step and note why.

### 2. Lock the behavior in with committed tests

Once verification PASSes, author or update **committed** tests so the behavior
can't silently regress — standard, not optional, for a user-visible change:

- A **deterministic regression test** (unit/integration) that reproduces the
  original bug or exercises the new behavior with **no external network** — stub
  or mock any third-party calls so the test is hermetic and fast.
- An **end-to-end Playwright spec** that walks the same golden path the workers
  verified, checked into the repo's e2e suite.

Run the repo's test command, confirm both pass, and commit them with the change.

### 3. Review with Greptile (before the PR)

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

### 4. Resolve findings by the P1/P2/P3 ruleset

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

### 5. Apply, verify, commit

- Apply P3 silently; apply P2 and collect diffs; act on P1 only per the human's
  decision.
- Re-run the repo's test/lint command after edits.
- Commit the fixes with a message that references the pre-PR review (e.g.
  `fix: address Greptile review findings`).

### 6. Create the PR

- Build the body with the **`/pr-format`** structure (Why / What / How /
  Solution / Verification / Caveats / Next steps). In Verification, record the
  browser feature-verification (golden + error path, N independent runs agreed,
  link/attach the screenshots), the tests added (regression + e2e), and that a
  Greptile review ran pre-PR and how findings were handled (N auto-fixed, M
  escalated).
- Push: `git push -u origin <branch>`.
- **Confirm before creating** — show the final title + body and the exact `gh`
  command, get a go-ahead, then:
  ```bash
  gh pr create --base <base> --head <branch> \
    --title "<concise imperative title>" --body-file <body.md>
  ```
- Report the returned PR URL.

## Final summary

Report: the browser feature-verification verdict (PASS + how many independent
worker runs agreed, screenshot evidence location) and the tests added
(regression + e2e); Greptile findings count, triage breakdown (P1/P2/P3), what
was auto-fixed vs escalated and the human's P1 decisions; the fix commit SHA;
and the created PR URL.

## Rules

- **Verify before review — for anything user-visible.** Prove the change works
  in the live app first. Delegate the browser walk to cheaper worker tiers
  (Sonnet/Haiku); the coordinator (Opus/Fable) never drives the browser itself.
- **Never PASS on a single run.** Require multiple independent runs to agree;
  divergence is a FAIL. Screenshots are mandatory evidence.
- **Every user-visible fix ships with tests** — a no-network deterministic
  regression test *and* an e2e Playwright spec, both committed.
- **Review before PR — always.** The whole point is a pre-reviewed PR; never
  invert the order.
- **Never auto-apply a P1.** Escalation is mandatory.
- **Triage table before edits.** The human sees the plan before code moves.
- **Confirm before creating the PR** — it is outward-facing.
- **Stay in scope** — fix what Greptile flagged; don't refactor adjacent code.
- **Don't force-push** a shared branch without asking.
