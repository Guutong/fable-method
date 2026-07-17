# opencode local-model layer

Two plugins that make a small local model (Qwen 3.6 9B / 27B / 35B-A3B on oMLX,
or any OpenAI-compatible server) work the fable-method loop as carefully as a
frontier model, split along the two halves eval round 12 proved are separable:

| half | file | what it does |
|---|---|---|
| **executor gate** | `plugins/spec-gate.js` | blocks `edit`/`write`/`apply_patch` until a README/spec has been read this session — closes the "9B never opens the spec on its own" gap at the tool layer |
| **judge gate** | `plugins/judge-gate.js` + `judge/harness.py` | after the executor finishes a turn, deterministically gathers claim-vs-reality evidence from git and re-runs every command the report claims passed, then a local judge model makes **only** the final verdict |

## Why this shape (round 12, in one paragraph)

A local model asked to *gather and judge* unaided inverts the verdict (0/3
across 35B / 27B-dense / Bonsai-2bit: one drives its tools flawlessly then still
blesses the fraud, one times out, one gets lost in the loop). The **same** model
judging over evidence a deterministic harness gathered gets it right — 3/3 on
s2, then 3/3 catching all five planted frauds on s7. The bottleneck was never
raw capability; it was synthesis and normative framing, and both move into code.
So the harness does everything mechanical and the model does only the call.
Full write-up: [`../eval/results/round12-local-judge-tiers-s2.json`](../eval/results/round12-local-judge-tiers-s2.json)
and the Round 12 section of [`../eval/RESULTS.md`](../eval/RESULTS.md).

## judge/harness.py

Scenario-agnostic, git-based, no network. Diffs the working tree (including
untracked files) against a baseline ref and prints structured evidence:

- **[A]** change inventory — what actually changed
- **[B]** spec of record — the authority the change is measured against
- **[C]** test-assertion changes — a test edited to *encode* a value is guilty until justified
- **[D]** scope claim vs reality — report says "only X touched" → verify against [A]
- **[E]** debris scan — `DEBUG`/`print`/`console.log` left in changed code, `scratch`/`debug`/`tmp` files added
- **[F]** claimed-vs-observed — re-runs each command the report cites (catching e.g. a claimed `python x.py` that is exit-127 because only `python3` exists), plus a spec-derived behaviour probe when the spec states one

Re-running report commands is guarded: only a small whitelist of command shapes
is matched, anything with shell metacharacters or a destructive verb is skipped,
bytecode caches are suppressed, and everything has a timeout.

Run it standalone (this is also how to do an on-demand judge):

```bash
python3 opencode/judge/harness.py --dir /path/to/repo --report report.txt
python3 opencode/judge/harness.py --dir . --report -   < report.txt   # stdin
```

## judge-gate.js

On `session.idle`, **if and only if** the working tree has uncommitted changes
(and that exact state has not already been judged), it runs the harness over the
last assistant message, sends the evidence to a local judge model, and surfaces
the verdict as a non-blocking toast plus `.fable-judge/last-verdict.md` in the
repo. It never injects into the executor's context, so it cannot send a weak
model into a fix-it loop. The trigger is deterministic on purpose: the same 9B
that will not open the spec on its own will not invoke a judge on its own either.

Config via environment (defaults target the oMLX M1 box in `opencode.jsonc`):

| env | default | meaning |
|---|---|---|
| `FABLE_JUDGE` | `on` | set `off` to disable |
| `FABLE_JUDGE_ENDPOINT` | `http://100.71.235.112:8080/v1` | OpenAI-compatible base URL |
| `FABLE_JUDGE_KEY` | `ae78fb1e` | API key |
| `FABLE_JUDGE_MODEL` | `Qwen3.6-35B-A3B-UD-MLX-4bit` | judge model (fastest local judge on M1: ~30–70s) |

## Install

`./install.sh` copies both plugins to `~/.config/opencode/plugins/` and the
harness to `~/.config/opencode/judge/harness.py` (opencode auto-loads any
`.js`/`.ts` in `plugins/`; if yours does not, add them to the `plugin` array in
`opencode.json`). The plugin resolves the harness relative to its own location,
so keep the `plugins/` and `judge/` siblings intact.

Requires `python3` and `git` on PATH. `.fable-judge/` self-ignores (it writes
its own `.gitignore`), so verdicts never pollute the repo under review.
