# marketplace

Sean's personal [Claude Code](https://claude.com/claude-code) plugin marketplace —
skills for SaaS engineering and automations.

## Install

```
/plugin marketplace add SeanningTatum/marketplace
/plugin install engineering-toolkit@sean-skills
/plugin install automation-toolkit@sean-skills
```

## Plugins

| Plugin | Description |
| --- | --- |
| [`engineering-toolkit`](./plugins/engineering-toolkit/README.md) | The ship-it loop: scaffold apps, pre-reviewed PRs, comment triage, releases, client feedback round-trips. |
| `automation-toolkit` | Skills for building and wiring up automations. |

## Skills at a glance

Every skill has a README with its **what / why / how** and a visual of the output:

| Skill | One-liner |
| --- | --- |
| [`new-app`](./plugins/engineering-toolkit/skills/new-app/README.md) | New SaaS app from the Cloudflare starter template in one command. |
| [`create-pr-with-review`](./plugins/engineering-toolkit/skills/create-pr-with-review/README.md) | PRs that are browser-verified, test-locked, and AI-reviewed before they exist. |
| [`resolve-comments`](./plugins/engineering-toolkit/skills/resolve-comments/README.md) | P1/P2/P3 triage of review comments — auto-fix the safe, escalate the risky. |
| [`pr-format`](./plugins/engineering-toolkit/skills/pr-format/README.md) | PR descriptions with a fixed, reviewer-first structure. |
| [`release`](./plugins/engineering-toolkit/skills/release/README.md) | Squash-merge → semver tag → branded GitHub release notes. |
| [`client-review`](./plugins/engineering-toolkit/skills/client-review/README.md) | Offline commentable HTML artifacts for clients, comments read back as markdown. |

## Develop

```bash
claude plugin validate .                          # validate the catalog
claude --plugin-dir ./plugins/engineering-toolkit # test a plugin locally
```

See [CLAUDE.md](./CLAUDE.md) for repository structure and conventions.
