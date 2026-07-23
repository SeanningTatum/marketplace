# engineering-toolkit

General software engineering skills and workflows for [Claude Code](https://claude.com/claude-code) — the ship-it loop: scaffold an app, verify and review changes, open clean PRs, resolve feedback, cut releases, and round-trip client feedback.

## Install

```
/plugin marketplace add SeanningTatum/marketplace
/plugin install engineering-toolkit@sean-skills
```

Skills are invoked as `/engineering-toolkit:<skill>`, or auto-invoked when the conversation matches their description.

## Skills

Each skill's README covers the **what**, **why**, and **how**, with a visual of its output.

| Skill | What it does |
| --- | --- |
| [`new-app`](./skills/new-app/README.md) | Scaffold a new SaaS app from the Cloudflare starter template — new repo, seeded agent docs, setup handoff. |
| [`create-pr-with-review`](./skills/create-pr-with-review/README.md) | Ship a branch as a PR that's already browser-verified, test-locked, and AI-reviewed (Greptile) before it exists. |
| [`resolve-comments`](./skills/resolve-comments/README.md) | Triage a PR's review comments P1/P2/P3 — auto-fix the safe ones, escalate the risky ones, reply to every thread. |
| [`pr-format`](./skills/pr-format/README.md) | Write a PR description reviewers can trust: Why / What / How / Solution / Verification / Caveats / Next steps. |
| [`release`](./skills/release/README.md) | Squash-merge a green PR, pick the semver tag, and publish a GitHub release with marketing-grade notes. |
| [`client-review`](./skills/client-review/README.md) | Turn any generated HTML doc into an offline commentable artifact for a client, then read their comments back as markdown. |

## How they fit together

```
new-app ──▶ build ──▶ create-pr-with-review ──▶ resolve-comments ──▶ release
                            │                        │
                            └── pr-format ───────────┘
client-review ──▶ (any HTML deliverable ⇄ client feedback loop)
```

A shared idea runs through the PR skills: the **P1/P2/P3 ruleset**. Trivial fixes happen silently (P3), bounded fixes happen but show you the diff (P2), and anything touching security, money, data, or architecture stops and asks a human (P1). When in doubt, escalate up.
