// spec-gate, an opencode plugin.
//
// Mechanically enforces rule 1 of AGENTS-local.md / the micro edition:
// "Before any edit that changes behavior, open the README or spec for the
// code you are changing." Round 11 and the round 12 diagnostic both found
// that a 9B model running inside opencode's tool loop never chooses to open
// the spec on its own before editing, even though the same rules produce the
// correct decision when the spec is simply handed to the model in one shot,
// outside the loop. The gap is a missing tool call, not the model's
// reasoning, so this plugin closes it at the tool layer instead of hoping a
// prompt rule gets followed.
//
// Drop this file in .opencode/plugins/ (project) or
// ~/.config/opencode/plugins/ (global). opencode auto-loads any .js/.ts file
// found there, no config entry needed.

const SPEC_NAME = /^(readme|spec|specification|contributing)(\.\w+)?$/i;
const SPEC_DIR = /(^|\/)(docs?|spec)\//i;
const TEST_NAME = /(^|\/)(test_|tests?\/).*\.\w+$|_test\.\w+$|\.test\.\w+$|\.spec\.\w+$/i;
const EDIT_TOOLS = new Set(["edit", "write"]);

function isSpecFile(filePath) {
  const base = filePath.split("/").pop() || "";
  return SPEC_NAME.test(base) || SPEC_DIR.test(filePath);
}

function isTestFile(filePath) {
  const base = filePath.split("/").pop() || "";
  return TEST_NAME.test(base) || TEST_NAME.test(filePath);
}

// apply_patch has no filePath arg: paths live inside patchText marker lines
// like "*** Update File: src/foo.py". Pull every path mentioned so a patch
// touching a source file is gated the same as edit/write.
function patchTouchedPaths(patchText) {
  if (!patchText) return [];
  const paths = [];
  const re = /^\*\*\*\s*(?:Add|Update|Delete) File:\s*(.+)$/gm;
  let m;
  while ((m = re.exec(patchText))) paths.push(m[1].trim());
  return paths;
}

export const SpecGatePlugin = async ({ directory } = {}) => {
  const specSeen = new Set(); // sessionID with at least one spec-file read
  const anySeen = new Set(); // sessionID with at least one read at all, of any kind

  function markSpecSeen(sessionID, filePath) {
    if (!filePath) return;
    anySeen.add(sessionID);
    if (isSpecFile(filePath)) specSeen.add(sessionID);
  }

  function gate(sessionID, filePath) {
    if (!filePath || isTestFile(filePath) || isSpecFile(filePath)) return;
    if (specSeen.has(sessionID)) return;
    throw new Error(
      "spec-gate: no README or spec file has been read in this session yet. " +
      "Open the README (or the docstring/spec for " + filePath + ") before " +
      "editing it. A failing test is not proof the code is wrong; if the " +
      "spec and the test disagree, report the conflict instead of editing " +
      "either one to match the other."
    );
  }

  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "read") return;
      markSpecSeen(input.sessionID, output && output.args && output.args.filePath);
    },
    "tool.execute.before": async (input, output) => {
      if (!input || !output || !output.args) return;
      if (input.tool === "apply_patch") {
        for (const p of patchTouchedPaths(output.args.patchText)) {
          gate(input.sessionID, p);
        }
        return;
      }
      if (!EDIT_TOOLS.has(input.tool)) return;
      gate(input.sessionID, output.args.filePath);
    },
  };
};

export default SpecGatePlugin;
