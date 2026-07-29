# ai-toolkit

**Ship LLM features the way you ship code** — versioned prompts, golden test sets, an eval suite that fails the build, and pipelines whose checker can actually say no. For [Claude Code](https://claude.com/claude-code).

![Skills](https://img.shields.io/badge/skills-3-brightgreen)
![Stack](https://img.shields.io/badge/agnostic-zod%20%2B%20promptfoo%20%2B%20LangGraph%20when%20earned-blue)

## Install

```
/plugin marketplace add SeanningTatum/marketplace
/plugin install ai-toolkit@sean-skills
```

Skills are invoked as `/ai-toolkit:<skill>`, or auto-invoked when the conversation matches their description.

## Skills

| Skill | Why you'd reach for it |
| --- | --- |
| [`prompt-scaffold`](./skills/prompt-scaffold/README.md) | Get a versioned prompt module, a hand-labeled golden set, and graders in your test runner — instead of a prompt string with no contract and no tests. |
| [`prompt-eval`](./skills/prompt-eval/README.md) | Turn "seems better" into a pass/fail against a committed baseline, with a calibrated judge and adversarial regressions as a hard gate. |
| [`prompt-pipeline`](./skills/prompt-pipeline/README.md) | Build the seams of a multi-step pipeline — coordinator, cheap workers, an independent checker, and a repair loop that fails closed. |

## How they fit together

```
prompt-scaffold ──▶ prompt-eval --baseline ──▶ iterate ──▶ prompt-eval (gate) ──▶ ship
       │                                                         ▲
       └── one scaffold per node ──▶ prompt-pipeline ─────────────┘
                                    (+ end-to-end suite for the seams)
```

## The opinion behind it

**Agnostic core, boring dev-time tooling.** The prompt module is plain typed code plus a schema, so it runs anywhere — including a Cloudflare Worker with no filesystem and no Python. Eval tooling (`promptfoo`) is a devDependency that never enters the runtime bundle, and deterministic graders ride your existing test command rather than standing up a second CI system.

**Frameworks are earned, not assumed.** A three-step linear pipeline does not need a chain library; typed step functions are the diagram. LangGraph gets imported when you actually need branching, retries, resumable state, or a human approval gate — which is a real threshold, not a vibe.

**Two rules the whole plugin is built around.** The model under test never writes its own labels and never grades its own output — both measure self-consistency, and a confidently wrong model is perfectly self-consistent. And any grader you trust must be shown capable of failing: a judge gets calibrated against hand-scored cases, a checker gets a known-bad case in its golden set, and a 0% rejection rate is treated as a bug, not a clean bill of health.
