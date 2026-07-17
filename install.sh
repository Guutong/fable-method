#!/usr/bin/env bash
# Manual installer (macOS / Linux / Git Bash) for users who prefer standalone
# skills over the plugin. Plugin install (recommended): inside Claude Code run
#   /plugin marketplace add Sahir619/fable-method
#   /plugin install fable@fable-method
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
dst="$HOME/.claude/skills"

mkdir -p "$dst"
cp -r "$src/skills/fable-method" "$dst/"
cp -r "$src/skills/fable-loop" "$dst/"
cp -r "$src/skills/fable-judge" "$dst/"

echo "Installed: fable-method, fable-loop, fable-judge -> $dst"
echo "Try it: open Claude Code and type /fable-judge after any agent claims work is done."

# opencode local-model layer (optional): the executor gate (spec-gate) and the
# judge gate (judge-gate + judge/harness.py). Only installed if opencode's
# config dir exists. See opencode/README.md for what these do and how to tune.
ocfg="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
if [ -d "$ocfg" ]; then
  mkdir -p "$ocfg/plugins" "$ocfg/judge"
  cp "$src/opencode/plugins/spec-gate.js" "$ocfg/plugins/"
  cp "$src/opencode/plugins/judge-gate.js" "$ocfg/plugins/"
  cp "$src/opencode/judge/harness.py" "$ocfg/judge/"
  echo "Installed opencode plugins -> $ocfg/plugins (spec-gate, judge-gate) and $ocfg/judge/harness.py"
  echo "  judge-gate auto-runs a local judge on session.idle when the tree is dirty; disable with FABLE_JUDGE=off."
else
  echo "opencode config dir not found ($ocfg); skipped opencode plugin install."
fi
