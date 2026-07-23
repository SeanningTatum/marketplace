# marketplace

**Skills for [Claude Code](https://claude.com/claude-code) that ship code, not just suggest it** — scaffold an app, get a browser-verified and AI-reviewed PR open, triage feedback, cut a branded release, and round-trip client comments. Sean's personal, actively-developed plugin marketplace.

![Plugins](https://img.shields.io/badge/plugins-2-blue)
![Skills](https://img.shields.io/badge/skills-6-brightgreen)
![Marketplace](https://img.shields.io/badge/claude--code-marketplace-orange)

## Install

```
/plugin marketplace add SeanningTatum/marketplace
/plugin install engineering-toolkit@sean-skills
/plugin install automation-toolkit@sean-skills
```

## Plugins

| Plugin | What you get |
| --- | --- |
| [`engineering-toolkit`](./plugins/engineering-toolkit/README.md) | The ship-it loop, end to end — scaffold, verify, review, resolve, release. |
| `automation-toolkit` | Skills for building and wiring up automations. |

## Skills at a glance

Every skill has a README with its **what / why / how** and a visual of the output:

| Skill | Why you'd reach for it |
| --- | --- |
| [`new-app`](./plugins/engineering-toolkit/skills/new-app/README.md) | New SaaS app, live repo to cloned wizard, in one command instead of an afternoon of setup. |
| [`create-pr-with-review`](./plugins/engineering-toolkit/skills/create-pr-with-review/README.md) | Open PRs that are already proven to work and already reviewed — reviewers see a second draft, not a first one. |
| [`resolve-comments`](./plugins/engineering-toolkit/skills/resolve-comments/README.md) | Clear the easy 80% of review comments automatically; the risky 20% still needs you. |
| [`pr-format`](./plugins/engineering-toolkit/skills/pr-format/README.md) | A PR description a reviewer trusts on the first read, every time. |
| [`release`](./plugins/engineering-toolkit/skills/release/README.md) | Ship notes that read like a launch, not a changelog nobody opens. |
| [`client-review`](./plugins/engineering-toolkit/skills/client-review/README.md) | Let a non-technical client comment on your doc without a server, an account, or a login. |

## Develop

```bash
claude plugin validate .                          # validate the catalog
claude --plugin-dir ./plugins/engineering-toolkit # test a plugin locally
```

See [CLAUDE.md](./CLAUDE.md) for repository structure and conventions.
