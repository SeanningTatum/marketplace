# marketing-toolkit

**Make the docs you generate as good as the code they describe.** Skills for the last-mile polish that turns a working thing into a thing people actually try — for [Claude Code](https://claude.com/claude-code) and [Kimi Code](https://www.kimi.com/code).

![Skills](https://img.shields.io/badge/skills-2-brightgreen)

## Install

Claude Code:

```
/plugin marketplace add SeanningTatum/marketplace
/plugin install marketing-toolkit@sean-skills
```

Kimi Code (from a clone of this repo):

```
/plugins install ./plugins/marketing-toolkit
```

Skills are invoked as `/marketing-toolkit:<skill>` (Claude Code) or `/skill:<skill>` (Kimi Code), or auto-invoked when the conversation matches their description.

## Skills

| Skill | Why you'd reach for it |
| --- | --- |
| [`readme-marketing-rewrite`](./skills/readme-marketing-rewrite/README.md) | Rewrite a whole README in plain, marketing-grade language backed by real screenshots of every surface, shipped as a reviewed PR. |
| [`mockup-screenshot`](./skills/mockup-screenshot/README.md) | Illustrate a README's output with a labeled, honest mockup when there's genuinely no live demo to capture. |

This plugin is split out from `engineering-toolkit` on purpose — engineering skills ship the change; marketing skills make the result legible to someone deciding whether to install it. Keeps each catalog focused on one concern.
