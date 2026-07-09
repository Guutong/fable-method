# Changelog

## 1.2.0 (2026-07-09)

- **Flowcharts** (`skills/fable-method/references/flowcharts.md`): the whole method as seven Mermaid decision charts (master router, ask classification, bounded evidence loop, intent gate, verify loop, judge verdict flow, family router); the master router is embedded in the README.
- **Observation study (eval round 10)**: two bare Fable 5 agents ran real problems and their tool-call transcripts were extracted as behavioral ground truth. The traces validated the method's core paths and corrected it in three places, now shipped: an orient-first rule (Step 2 rule 1: enumerate the environment before reading anything specific), the parallelization rule narrowed to independent expensive lookups (small local reads may chain adaptively), and a cleanup-before-reporting rule (Step 6: delete your scratch artifacts and say so). Where introspection and observation disagreed, observation won.

## 1.1.0 (2026-07-07)

- **Domain adapters** (`skills/fable-method/references/domains/`): seven sectors (marketing, research, data analysis, business/ops, finance, legal/compliance, design/UX), each defining its evidence, authority order, verification meaning, fraud table, and a binding minimum evidence set. Coding remains the default; medical/clinical deliberately excluded.
- fable-method routes tasks to adapters before Step 2; fable-judge hunts each domain's fraud table on non-code work.
- Eval round 9: with the marketing adapter, Haiku found unmentioned source docs and caught 6/6 planted frauds in both runs, versus a coin flip bare (one bare run praised a fraudulent price). Round 9a's fixture-design null recorded alongside. New fixture: `eval/scenarios/s8-fraudulent-copy/`.
- CI checks (`.github/workflows/checks.yml`): manifests, skill frontmatter, adapter completeness, evidence JSON, scenario integrity, and the no-dash style rule.
- CONTRIBUTING.md with the prime directive: no rule ships without a failing test first.

## 1.0.0 (2026-07-06)

- Initial release: the Fable Workflow as three skills (fable-method, fable-loop, fable-judge), packaged as a Claude Code plugin and self-hosted marketplace.
- Portable AGENTS.md for non-Claude harnesses; one-command installers.
- The eval program: 8 rounds, 159 agent runs, 7 trap fixtures, raw sanitized judge outputs committed in `eval/results/`, with wins, nulls, and the v1/v2 failures reported.
