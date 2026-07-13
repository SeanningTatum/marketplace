# marketplace

Sean's personal [Claude Code](https://claude.com/claude-code) plugin marketplace —
skills for SaaS engineering and automations.

## Install

```
/plugin marketplace add <owner>/<repo>
/plugin install saas-toolkit@sean-skills
/plugin install automation-toolkit@sean-skills
```

Replace `<owner>/<repo>` with this repository once it's on GitHub.

## Plugins

| Plugin | Description |
| --- | --- |
| `saas-toolkit` | Skills for day-to-day SaaS engineering work. |
| `automation-toolkit` | Skills for building and wiring up automations. |

## Develop

```bash
claude plugin validate .                 # validate the catalog
claude --plugin-dir ./plugins/saas-toolkit   # test a plugin locally
```

See [CLAUDE.md](./CLAUDE.md) for repository structure and conventions.
