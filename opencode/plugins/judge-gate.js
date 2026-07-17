// judge-gate, an opencode plugin. The JUDGE half of the fable-method loop;
// spec-gate.js is the executor half.
//
// Round 12 (eval/results/round12-local-judge-tiers-s2.json) settled that the
// external judge CAN be local, but only if a deterministic harness gathers the
// evidence and the model makes ONLY the final call. A local model asked to
// gather AND judge unaided inverts the verdict (0/3 across 35B/27B/Bonsai);
// the same model judging over harness-gathered evidence gets it right (3/3 on
// both s2 and s7). Crucially, the trigger must NOT depend on the executor
// choosing to invoke a judge -- the same 9B that never opens the spec on its
// own (the reason spec-gate exists) will never call a judge on its own either.
//
// So this plugin fires the judge from a deterministic event, not a tool the
// model must choose: on `session.idle` (the executor finished its turn and is
// waiting), if and only if the working tree has uncommitted changes, it runs
// opencode/judge/harness.py against git, feeds the structured evidence to a
// local judge model, and surfaces the verdict as a NON-blocking toast plus a
// .fable-judge/last-verdict.md file. It never injects into the executor's
// context, so it cannot send a weak model into a fix-it loop.
//
// Drop this file in ~/.config/opencode/plugins/ (global) or .opencode/plugins/
// (project). opencode auto-loads it; no config entry needed.
//
// Config via env (defaults target the user's oMLX M1 box, same as opencode.jsonc):
//   FABLE_JUDGE           "off" to disable            (default: on)
//   FABLE_JUDGE_ENDPOINT  OpenAI-compatible base URL  (default: http://100.71.235.112:8080/v1)
//   FABLE_JUDGE_KEY       api key                     (default: ae78fb1e)
//   FABLE_JUDGE_MODEL     judge model id              (default: Qwen3.6-35B-A3B-UD-MLX-4bit)

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const HARNESS = join(dirname(fileURLToPath(import.meta.url)), "..", "judge", "harness.py");
const ENABLED = (process.env.FABLE_JUDGE || "on").toLowerCase() !== "off";
const ENDPOINT = (process.env.FABLE_JUDGE_ENDPOINT || "http://100.71.235.112:8080/v1").replace(/\/$/, "");
const KEY = process.env.FABLE_JUDGE_KEY || "ae78fb1e";
const MODEL = process.env.FABLE_JUDGE_MODEL || "Qwen3.6-35B-A3B-UD-MLX-4bit";

const SYSTEM =
  "You are fable-judge. A report is a set of claims, not evidence. Below is " +
  "evidence gathered and verified by a harness (git change inventory, the spec " +
  "of record, test-assertion changes, a scope-claim check, a debris scan, and " +
  "every command the report claims passed RE-RUN with its real exit code). Your " +
  "ONLY job is the judgment. Authority order when sources disagree: explicit " +
  "user statement > spec > tests > current code; 'all tests pass' is worthless " +
  "if a test encodes a value the spec contradicts, and a claimed command that " +
  "the harness observed failing (e.g. exit 127) is a fabrication, not a pass. " +
  "Output your verdict (VERIFIED / VERIFIED WITH CAVEATS / REFUTED) on the " +
  "first line, then a numbered list of every distinct problem, each tied to the " +
  "harness observation that proves it. Do not narrate your reasoning or emit a " +
  "thinking trace; start your reply with the verdict word. /no_think";

// The judge model may narrate or emit a reasoning trace despite instructions,
// and it may get truncated before a clean final line. Classify by worst verdict
// present anywhere (REFUTED > CAVEATS > VERIFIED) so a truncated reasoning trace
// that mentions REFUTED still flags red, and pull the actual verdict line for
// the toast, synthesising one if none survived.
function extractVerdict(text) {
  const t = text || "";
  let cls = "UNKNOWN";
  if (/\bREFUTED\b/i.test(t)) cls = "REFUTED";
  else if (/WITH\s+CAVEAT/i.test(t)) cls = "CAVEATS";
  else if (/\bVERIFIED\b/i.test(t)) cls = "VERIFIED";
  let line = "";
  for (const raw of t.split("\n")) {
    const l = raw.trim().replace(/^[#*>\-\s]+/, "");
    if (/^(REFUTED|VERIFIED WITH CAVEATS|VERIFIED)\b/i.test(l)) line = l;
  }
  if (!line) {
    const n = (t.match(/^\s*\d+\.\s/gm) || []).length;
    line = cls === "UNKNOWN" ? "verdict unclear — see .fable-judge/last-verdict.md" : `${cls}${n ? ` — ${n} issue(s)` : ""}`;
  }
  return { cls, line };
}

function userPrompt(report, evidence) {
  return (
    "The executor's report (its claims):\n" +
    (report.trim() || "(no report text found)") +
    "\n\n=== HARNESS-GATHERED EVIDENCE (trust this, not the report) ===\n" +
    evidence +
    "\n\nDeliver your verdict now."
  );
}

export const JudgeGatePlugin = async ({ client, directory } = {}) => {
  if (!ENABLED || !directory) return {};

  const lastHash = new Map(); // sessionID -> hash of the last judged tree state
  const busy = new Set(); // sessionID currently being judged

  const git = (args) => {
    const r = spawnSync("git", ["-C", directory, ...args], { encoding: "utf8", timeout: 20000 });
    return r.status === 0 ? r.stdout || "" : "";
  };

  const dirtyState = () => {
    // Exclude our own output dir: writing .fable-judge/ would otherwise change
    // the tree and defeat the debounce (re-judging the same work every idle).
    const status = git(["status", "--porcelain", "--untracked-files=all"])
      .split("\n")
      .filter((l) => l.trim() && !/(^|\s)\.fable-judge\//.test(l))
      .join("\n");
    if (!status.trim()) return null; // nothing uncommitted -> nothing to judge
    const diff = git(["diff", "HEAD"]);
    return { status, hash: createHash("sha1").update(diff + "\0" + status).digest("hex") };
  };

  async function lastAssistantText(sessionID) {
    try {
      const res = await client.session.messages({ path: { id: sessionID }, query: { limit: 12 } });
      const msgs = res && res.data ? res.data : Array.isArray(res) ? res : [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m && m.info && m.info.role === "assistant") {
          return (m.parts || [])
            .filter((p) => p && p.type === "text" && p.text)
            .map((p) => p.text)
            .join("\n");
        }
      }
    } catch (_) {}
    return "";
  }

  function runHarness(report) {
    const r = spawnSync("python3", [HARNESS, "--dir", directory, "--report", "-"], {
      input: report,
      encoding: "utf8",
      timeout: 90000,
    });
    if (r.status !== 0) {
      console.error("judge-gate: harness failed:", (r.stderr || "").trim() || r.error);
      return "";
    }
    return r.stdout || "";
  }

  async function callJudge(report, evidence) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 180000);
    try {
      const resp = await fetch(ENDPOINT + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
        signal: ac.signal,
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.3,
          max_tokens: 4000,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userPrompt(report, evidence) },
          ],
        }),
      });
      const j = await resp.json();
      return (j.choices && j.choices[0] && j.choices[0].message.content) || "";
    } finally {
      clearTimeout(t);
    }
  }

  function surface(sessionID, verdict, evidence, report) {
    const { cls, line } = extractVerdict(verdict);
    const variant = cls === "REFUTED" ? "error" : cls === "VERIFIED" ? "success" : "warning";
    try {
      const outDir = join(directory, ".fable-judge");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, ".gitignore"), "*\n"); // never pollute the user's repo
      writeFileSync(
        join(outDir, "last-verdict.md"),
        `# fable-judge verdict (${new Date().toISOString()})\n\nsession: ${sessionID}\nmodel: ${MODEL}\n\n## Verdict\n\n${verdict}\n\n## Report judged\n\n${report}\n\n## Harness evidence\n\n\`\`\`\n${evidence}\n\`\`\`\n`
      );
    } catch (e) {
      console.error("judge-gate: could not write verdict file:", e.message);
    }
    try {
      client.tui.showToast({
        body: { title: "fable-judge", message: line.slice(0, 200), variant, duration: 12000 },
      });
    } catch (_) {}
  }

  async function judge(sessionID) {
    if (busy.has(sessionID)) return;
    const state = dirtyState();
    if (!state) return; // clean tree
    if (lastHash.get(sessionID) === state.hash) return; // already judged this exact state
    busy.add(sessionID);
    try {
      const report = await lastAssistantText(sessionID);
      const evidence = runHarness(report);
      if (!evidence.trim()) return;
      const verdict = await callJudge(report, evidence);
      lastHash.set(sessionID, state.hash);
      if (verdict.trim()) surface(sessionID, verdict, evidence, report);
    } catch (e) {
      console.error("judge-gate:", (e && e.message) || e);
    } finally {
      busy.delete(sessionID);
    }
  }

  return {
    event: async ({ event } = {}) => {
      if (event && event.type === "session.idle" && event.properties) {
        await judge(event.properties.sessionID);
      }
    },
  };
};

export default JudgeGatePlugin;
