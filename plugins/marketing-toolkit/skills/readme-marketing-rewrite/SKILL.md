---
name: readme-marketing-rewrite
description: Coordinator playbook — rewrite a repo's README in plain, marketing-grade language that actually shows off what the product does, backed by real screenshots/GIFs of it running, then ship it as a reviewed PR. Use when asked to make a README better for marketing/humans, make it easier to read, show off features with screenshots, or "make our README pop."
user-invocable: true
---

# HANDOFF: rewrite a README for marketing + readability (copy-paste into a new repo)

Drop this file's body as your first message to Claude Code in a new repo
(or save it as `.claude/skills/readme-marketing-rewrite/SKILL.md` if this
org uses skill directories). It reproduces the exact playbook used to turn
brain-axi's README into a plain-language, marketing-grade page — real
screenshots of every surface (terminal, browser UI, annotation flow), a
demo GIF, and an accurate install story — PR'd through review.

## What you're asking Claude to do

> Act as a coordinator. Rewrite our README in plain, easy-to-read language
> that actually sells what this thing does and shows it off with real
> screenshots — every surface, not just the terminal. Add a demo GIF too.
> Delegate to sub-agents — don't do the whole thing serially yourself.
> Then open it as a reviewed PR.

## The playbook (in order)

### 1. Scout first — inline, don't delegate this part

Before spawning anything, gather ground truth yourself:

- Read the current README in full.
- Find the thing's real entry point (CLI `--help`, a running dev server, a
  library's public API) and **capture real output** — not invented
  examples. For a CLI: run every documented command and `--help` for
  undocumented ones, save to a scratch dir.
- Check what's *missing* from the current README (commands/features that
  shipped since the last doc pass — diff the real `--help`/API surface
  against what's documented).
- **Check for screenshots that already exist before planning to capture
  new ones.** If the project does feature verification (Playwright walks,
  a `.brain/features/*/screenshots/` style evidence trail, a test
  snapshots dir), those are real, already-proven captures of the actual
  UI — reuse them directly instead of re-rendering or re-capturing. Only
  generate new visuals for surfaces that genuinely have no existing real
  capture.
- Check for terminal-recording tooling if you'll want a GIF (`vhs`,
  `freeze`, `agg`, `asciinema`). If none installed, plan to render the demo
  with HyperFrames instead (composition-as-code, deterministic, no capture
  step needed) — invoke the `hyperframes` skill for that branch of work.
- If the product has a running browser-based UI (not just a CLI) and no
  existing screenshot exists for some part of it, plan to capture it live:
  start the real server/process, then use `claude-in-chrome` if connected,
  or headless Chrome (`google chrome --headless --screenshot=... <url>`,
  legacy `--headless` flag — the newer `--headless=new` mode can hang
  indefinitely on `--screenshot`) as the fallback.
- Create a working branch off **current** `main`/`master` tip (not off some
  older feature branch — see the squash-merge trap in step 6).
- **Check for a concurrent session on the same checkout before branching.**
  `git status` clean but `ps aux | grep node` (or whatever the project's
  runtime is) showing a live dev/build/review-server process that predates
  your own work is a signal someone else — another terminal, another
  agent session — is actively working in this exact working directory. If
  you see uncommitted changes to files you didn't touch appear between two
  of your own tool calls, stop and ask before branching, committing, or
  switching branches; don't guess and don't "clean up" what looks like
  scope creep until you've confirmed it isn't someone else's real work.

### 2. Delegate two agents in parallel, one message, two tool calls

**Agent A — copywriter** (fresh agent, no fork; give it full context since
it starts blank):
- Feed it: the current README, the project's CLAUDE.md/AGENTS.md if any,
  and the real captured output/screenshots from step 1.
- Ask for: a sharp tagline, a short "why" section that sells the actual
  pain being solved in plain language (not hype adjectives, not jargon a
  newcomer wouldn't know), quick start, a *complete and verified*
  command/API reference (cross-check every claim against the real
  captured output — don't let it invent flags), and references to image
  asset paths you've pre-agreed on (e.g. `docs/assets/demo.gif`,
  `docs/assets/<feature>.png`) even though the files don't exist yet.
- Give it a **voice brief**, explicitly:
  - Confident and concrete — sell with specifics (a real number, a real
    command, a real before/after), never with unearned adjectives
    ("blazingly fast", "revolutionary", "seamless").
  - Plain language over jargon: assume the reader is smart but new to this
    specific tool; explain *why* a design choice matters before naming it.
  - Every factual claim must be checkable against something you captured
    in step 1 — an install command, a flag, a behavior. If it can't be
    checked, cut it or hedge it honestly.
  - Show, don't just tell: prefer "here's the actual output" over "it's
    fast and easy to use."
- Tell it explicitly: create the asset directory *paths as references
  only* — do not create placeholder files, do not commit, only edit the
  README.

**Agent B — visual capture**:
- If reusing existing real screenshots (per step 1), just copy them into
  the agreed asset paths with clear names — no agent needed for that part,
  do it yourself, it's mechanical.
- For anything needing fresh capture: invoke the `hyperframes` skill for
  rendered terminal/CLI demos (motion-graphics workflow fits a short
  unnarrated clip), or hand a fresh agent the live-capture task (start the
  real server, drive a browser, screenshot the real rendered page) for
  actual running-app UI that has no existing evidence.
- Feed it the same real captured output/state from step 1 as the literal
  content — verbatim, no invented data.
- Ask for: a short (~10-15s) looping demo GIF under a few MB, plus stills
  of every surface worth showing (not just the terminal — if there's a
  browser UI, a review flow, an annotation step, show those too), at the
  exact paths Agent A is referencing.
- Tell it explicitly: do not touch the README, do not commit, and if a
  live-capture task drifts into doing unrelated work (e.g. it goes looking
  for "a real example" and decides to create one instead of using what
  exists), that's a scope violation — the prompt should preempt this by
  naming the exact existing artifact to use, not leaving it to search.

Launch both in a single message (independent work, no shared state) so
they run concurrently.

### 3. Handle spend-limit / budget failures without losing progress

Long-running render agents can die mid-task on an org spend limit. If one
does:
- Check what it left on disk before respawning — don't restart from
  scratch. A composition/project directory, generated fragments, or
  partial output are all reusable.
- Respawn with a **cheaper model** (e.g. step down a tier) and an
  explicitly narrowed prompt: resume from the exact point it died, skip
  reloading heavy reference material it already had access to, minimize
  preview/render iterations (lint once, render once).

### 4. Verify before committing

- Actually look at the assets (read image files, extract a mid-frame from
  the GIF) — don't just trust the agent's self-report of file sizes.
- Spot-check the README's examples against your step-1 captures — agents
  drift (e.g. showing flags that don't match the output underneath them,
  or linking to something unverifiable). Fix inline, don't re-delegate for
  small nits.
- Re-read the copy once as a first-time reader: does it explain the *why*
  before the *what*? Would someone who's never seen this tool understand
  each section without needing the codebase open in another tab?
- Commit in phases (README text, then assets) so the history stays
  legible.

### 5. Check for a concurrent-session collision before every git operation

Re-check `git status` and any relevant running processes right before
`checkout -b`, `add`, `commit`, or `push` — not just once at the start.
A scout that was clean five minutes ago can have live, unrelated,
legitimate changes from someone else's session by the time you're ready
to commit. If you see it, stop and ask rather than stage everything or
try to branch around it blind. When you do proceed, stage your exact
files by name (never `-A` or `.`) so you can never sweep up someone else's
in-flight work by accident.

### 6. Before opening the PR: check for the squash-merge trap

If your branch was cut from an older feature branch that has since been
**squash-merged** into main, `git diff main...yourbranch` will drag in the
entire already-shipped feature as phantom diff — because the commits share
no SHA with what landed on main even though the tree is identical.

Check: `git diff <old-branch> main --stat` — if empty, the trees match and
you've got a squash-merge situation. Fix: cherry-pick just your real
commits onto a **fresh branch off current main**, and confirm the
three-dot diff (`git diff main...newbranch --stat`) shows only your
intended files before pushing.

### 7. Open the PR through a reviewed-PR flow

Use this org's `/create-pr-with-review`-style skill if one exists (review
→ resolve → PR, never PR-first). If the review backend fails:
- Retry 2-3 times with a beat in between — check `<tool> review status`
  for a persistent vs. transient signal.
- If it's failing at the same stage with distinct correlation/request IDs
  across attempts (not one interrupted job), that's a backend outage, not
  something a retry loop fixes. Surface it to the user with the
  correlation IDs and ask whether to proceed without the automated pass —
  don't decide that unilaterally, and don't silently skip it either.
- If approved to proceed, say so plainly in the PR body's verification
  section (reviewers should know a pre-PR bot pass didn't happen and why).

### 8. If the project wants distribution via `npx skills add`

Don't assume a devDependency + SessionStart hook is the right install
model — check whether the tool is meant to ship as an installable
**Agent Skill** instead (the [agentskills.io](https://agentskills.io)
format, installed with [`npx skills`](https://github.com/vercel-labs/skills)):

- The skill must live at `.claude/skills/<name>/SKILL.md` in the repo —
  `npx skills add <owner>/<repo> --skill <name>` only discovers skills
  under `.claude/skills/`, not a bare top-level `skills/` directory. Verify
  with `npx skills add <owner>/<repo> --list` before assuming it works.
- The generated skill's YAML frontmatter `description` must be **quoted**
  if it contains a mid-string `: ` — an unquoted YAML plain scalar can't
  contain that sequence, and some installers (confirmed: `npx skills`)
  silently drop the whole skill from discovery on a parse failure instead
  of erroring. `JSON.stringify()`'ing the description is a valid YAML
  double-quoted scalar and a safe fix.
- If the skill's own instructions tell the agent to run the tool via
  `npx -y <package-name>`, that package must actually be **published to
  npm** — check with `npm view <package-name> version`. A 404 there means
  the documented install path is broken even if the skill installs fine.
  Publishing is a real, semi-irreversible public action (name squatting,
  can't be undone) — confirm with the user before doing it, don't assume
  it from a feature request.
- `npx skills add` resolves branch refs awkwardly for slash-containing
  branch names (`owner/repo#feature/foo` and the `/tree/<branch>/<path>`
  form both choke on multi-segment branch names) — to test a fix before
  merging, either use a single-segment branch name or just merge to
  main/master first and test there.

## Reusable bits worth keeping verbatim

- **"Scout first, delegate second"** — never hand an agent a rewrite task
  without real captured ground truth; agents invent plausible-looking
  flags and numbers when starved of real data.
- **Reuse real evidence over generating new visuals** — a project's own
  feature-verification screenshots are already proof the UI works; copying
  them is faster and more honest than a fresh synthetic capture.
- **Voice: concrete over hyped, plain over jargon** — every claim traces
  to something captured in step 1; sell with a real example, not an
  adjective.
- **Two independent fresh agents, one message** — copy and visuals don't
  depend on each other; running them serially wastes wall-clock for no
  reason.
- **Resume-from-disk on failure** — a dead agent's scratch directory is
  salvageable work, not wasted spend; respawn narrow and cheap rather than
  restarting the full brief.
- **Verify visually, not just structurally** — read the actual image
  bytes / extract a GIF frame before trusting a "done" report.
- **The squash-merge diff trap** — always sanity-check the three-dot diff
  against current main before pushing a PR branch that outlived a few
  merges.
- **Don't assume the install model** — a CLI/tool can be distributed as a
  devDependency + session hook, a globally-installed CLI, or an Agent
  Skill; these are different mechanisms with different discovery rules.
  Ask or check the project's actual convention before wiring anything in.
- **Watch for concurrent sessions on a shared checkout** — re-check git
  status and running processes right before every git operation, not just
  at the start; stage files by name, never in bulk, so you can't sweep up
  someone else's in-flight work.
