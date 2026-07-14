# Changelog

## 1.3.0 (2026-07-14)

- **Local edition** (`AGENTS-local.md`): the method cut to fit small local models (roughly 7B-14B, 8k-16k context, single tool calls) run through opencode, aider, or any harness pointed at an oMLX / llama.cpp / Ollama server. Rules a small model cannot execute (subagents, parallel batches, web fetches, domain adapters) are deleted rather than left to be ignored; the surviving rules keep their tested thresholds, and the new small-model rules (`GOAL:` and `VERIFIED:` forced artifacts, one call at a time, the ~100-line read cap) extend the round-3 forced-artifact finding but are explicitly marked **pending eval**, per the prime directive.
- README: a Local / small models install section with a working opencode + oMLX config, the note that oMLX's Anthropic-compatible endpoint lets Claude Code run against the same server via `ANTHROPIC_BASE_URL` with no proxy, and instructions for A/B-testing a local model on the s2 trap fixture.
- **Eval round 11** (2026-07-15): AGENTS-local.md met a real 9B (Qwythos-9B-v2 via oMLX + opencode) on the s2 trap. Decisive null, 7 runs, 0 passes, failure surface mapped: a canary probe confirmed the harness injects rules files and the model follows a one-line rule, yet the 60-line method (as rules file AND inlined, 3 runs) and a 5-rule micro variant (2 runs) all failed. Inline runs emitted the INTENT and VERIFIED artifacts while inverting their meaning at the decision point (authority order flipped, specs doctored to match the wrong test, VERIFIED twice fabricated, one run quoting a command that does not exist on the machine). A fable-judge pass by a frontier model refuted the fraudulent run in four commands. The pending-eval label is replaced by the recorded result and guidance: on this model class the artifacts are an audit trail for an external judge, not a guarantee. `eval/results/round11-local-9b-s2.json`.

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
