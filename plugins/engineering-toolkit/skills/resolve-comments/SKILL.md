---
name: resolve-comments
description: Read a GitHub PR's review comments and resolve them automatically where safe, triaging each by a P1/P2/P3 severity ruleset — P3 auto-fixed, P2 auto-fixed then shown, P1 escalated to a human before any change. Use when asked to "resolve PR comments", "address review feedback", "fix the review comments", or invokes /resolve-comments. Finishes by re-triggering a Greptile re-review if Greptile has commented.
user-invocable: true
---

# resolve-comments

Read the review comments on a GitHub pull request, decide which ones an agent
may safely act on, fix those, and escalate the rest to a human. The goal is
**velocity without recklessness** — trivial and well-scoped feedback gets
resolved automatically; anything that carries real risk or needs a judgment
call is handed to a person, never silently applied.

`$ARGUMENTS` may name the PR (a URL, `owner/repo#N`, or a number). If empty,
resolve the PR for the current branch.

## When to use

- "Resolve the PR comments" / "address the review feedback" / "fix the review".
- After a reviewer (human or bot: Greptile, CodeRabbit, Copilot) leaves comments.
- Runs `/resolve-comments`.

Do **not** use this to write a PR body (that's `/pr-format`) or to run a
pre-PR review pass yourself (that's `/create-pr-with-review`).

## The severity ruleset

Every actionable comment is triaged into exactly one priority. **When in doubt,
escalate up** — a wrongly-auto-applied P1 is far more expensive than a human
glancing at a P3.

### P1 — human in the loop (STOP, escalate, do not auto-apply)

The change is risky, ambiguous, or a product/architecture decision. Surface it
to the human and let *them* decide the approach before touching code.

Triggers (any one):
- Touches **security, auth, secrets, permissions, or crypto**.
- Touches **payments, billing, or money movement**.
- **Data migrations, schema changes, or destructive data ops.**
- **Breaking API/contract changes** or anything affecting public interfaces.
- **Architecture / design disagreement** — reviewer proposes a different approach.
- The comment is **ambiguous, speculative, or conflicts** with another comment.
- The fix would require **broad changes** (many files / a refactor) to satisfy.
- Reviewer explicitly asks a **question** rather than requesting a specific change.

Action: collect all P1 items and present them to the human with
`AskUserQuestion` (or a clear written summary if the tool is unavailable) —
each with the comment, the file/line, and 2–3 concrete options for how to
proceed. Wait for the decision. Never guess on a P1.

### P2 — auto-fix, then show (act, but surface the diff before pushing)

Clear, bounded, mechanical-to-moderate change with an unambiguous correct fix.

Triggers (all of): single concern, localized (typically 1–few files), the
reviewer stated *what* they want, and no P1 trigger fires.
Examples: fix a logic/off-by-one bug the reviewer pinpointed, add a missing
null check, extract a duplicated block they flagged, add the test they asked
for, tighten a type.

Action: apply the fix, then show the human the resulting diff **before pushing**.
Batch all P2 diffs into one review-and-push step.

### P3 — auto-fix silently (act, no confirmation needed)

Trivial, zero-judgment change.
Examples: typos, comment/wording tweaks, import ordering, formatting/lint,
renaming per an explicit reviewer suggestion, removing a stray `console.log`.

Action: apply directly. No confirmation required. Include in the final summary.

## Workflow

1. **Resolve the PR.** From `$ARGUMENTS` or, if empty, the current branch:
   `gh pr view --json number,url,headRefName,baseRefName,title`.

2. **Fetch all comments** — cover every surface, comments live in three places:
   ```bash
   # Inline review comments (file/line-anchored)
   gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate
   # Review summaries (APPROVE/REQUEST_CHANGES/COMMENT bodies)
   gh api repos/{owner}/{repo}/pulls/{number}/reviews --paginate
   # Issue-level (general) PR comments
   gh api repos/{owner}/{repo}/issues/{number}/comments --paginate
   ```
   Skip comments already resolved/outdated, and skip your own prior replies.

3. **Triage.** Classify each actionable comment P1 / P2 / P3 per the ruleset.
   Print the triage table first (comment → file:line → priority → planned action)
   so the human sees the plan before any code changes.

4. **Handle P1 first — escalate and block.** Present every P1 to the human and
   wait. Do not proceed to P2/P3 edits that depend on a P1 decision; independent
   P2/P3 items may proceed in parallel.

5. **Apply P3** silently. **Apply P2** and collect the diffs.

6. **Show P2 diffs, then commit + push.** After the human okays the P2 batch
   (and any P1 direction), commit with a message referencing the review, and
   push to the PR branch. Never force-push a shared branch without asking.

7. **Reply on GitHub.** For each resolved thread, post a short reply noting what
   changed (or that it was applied in commit `<sha>`). For P1 items, reply with
   the decision reached. Use `gh api .../comments/{id}/replies` for inline
   threads.

8. **Re-trigger Greptile** (final step — see below).

## Finishing: re-trigger Greptile

After resolving comments and pushing, check whether **Greptile** has reviewed
this PR. Greptile posts as a bot (login typically `greptile-apps[bot]` or
containing `greptile`).

```bash
# Look for any Greptile comment across reviews + issue + inline comments
gh api repos/{owner}/{repo}/issues/{number}/comments --paginate \
  --jq '.[] | select(.user.login | test("greptile"; "i")) | .id'
```

- **If Greptile has commented**, post an issue comment on the PR to trigger a
  fresh pass:
  ```bash
  gh pr comment {number} --body "@greptile review again"
  ```
- **If Greptile has not commented**, skip this — do not summon it unprompted.
  Note in the summary that Greptile hadn't reviewed, so no re-review was triggered.

## Final summary

Report: counts per priority, what was auto-fixed (P3), what was fixed-and-shown
(P2), what was escalated and the human's decision (P1), the pushed commit SHA,
and whether a Greptile re-review was triggered.

## Rules

- **Never auto-apply a P1.** Escalation is mandatory; guessing defeats the point.
- **Triage table before edits.** The human sees the plan before code moves.
- **One concern per fix.** Don't bundle unrelated changes into one comment's fix.
- **Stay in scope.** Fix what the comment asked; don't refactor adjacent code.
- **Confirm before pushing** to a shared branch; never force-push without asking.
- **Reply to every thread you touch** so reviewers see resolution, and re-run
  the repo's test/lint command after edits before pushing.
