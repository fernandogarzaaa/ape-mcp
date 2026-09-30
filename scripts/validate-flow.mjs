// Final user-style validation: the whole flow through the REAL entrypoints
// with the mock provider (no API key). Start -> watch -> cancel -> list ->
// ledger -> tasks. Prints PASS/FAIL per step with warnings preserved as-is;
// exits non-zero on any failure.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "ape-mcp.js");
const env = {
  ...process.env,
  APE_ALLOW_MOCK_INPUT: "1",
  APE_MOCK_STEP_DELAY_MS: "600",
  APE_DATA_DIR: mkdtempSync(join(tmpdir(), "ape-validate-flow-")),
  APE_MAX_CONCURRENT_RUNS: "32",
  APE_MAX_DAILY_USD: "1000000",
};

let failures = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
function run(tool, args) {
  const out = execFileSync("node", [bin, "run", tool, JSON.stringify(args)], { encoding: "utf8", env, timeout: 60000 });
  return JSON.parse(out).structuredContent.result;
}

// 1. Start through the real CLI path.
const script = [
  { tool: "skein.orchestrate", args: { op: "status" } },
  { tool: "skein.orchestrate", args: { op: "status" } },
  { tool: "skein.orchestrate", args: { op: "status" } },
  { tool: "finish", args: { summary: "validation flow" } },
];
const t0 = Date.now();
const started = run("ape_agent_run", { profile: "repo-triage", objective: "validation flow", _mockScript: script });
const runId = started.run_id;
check("start returns a run_id promptly", typeof runId === "string" && Date.now() - t0 < 5000, `${runId} in ${Date.now() - t0}ms`);

// 2. Watch: genuine running frames with streaming steps and live totals.
let sawRunning = false;
let sawSteps = 0;
let sawLiveTotals = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 300));
  const st = run("ape_agent_status", { run_id: runId });
  if (st.status === "running") sawRunning = true;
  sawSteps = Math.max(sawSteps, st.steps?.length ?? 0);
  if (st.status === "running" && (st.steps?.length ?? 0) > 0 && st.total_tokens === 0 && st.step_count === 0) {
    console.log("WARN  mid-run row totals are zero (recordStep not active?)");
  }
  if (st.status === "running" && (st.steps?.length ?? 0) > 0 && (st.total_tokens > 0 || st.step_count > 0)) {
    sawLiveTotals = true;
  }
  if (st.status !== "running") break;
  if (i === 1) {
    // 3. Cancel mid-run (only while still running).
    const c = run("ape_agent_cancel", { run_id: runId });
    check("cancel stops a live run", c.status === "stopped" && c.stop_reason === "cancelled", JSON.stringify(c).slice(0, 120));
  }
}
check("observed genuine running frames", sawRunning);
check("steps streamed mid-run", sawSteps > 0, `${sawSteps} rows`);
check("row totals live mid-run", sawLiveTotals);
const fin = run("ape_agent_status", { run_id: runId });
check("cancelled run stays stopped + pollable", fin.status === "stopped" && fin.stop_reason === "cancelled");
check(
  "interruption marker present",
  (fin.steps ?? []).some((s) => s.kind === "cancel" && String(s.result_summary).includes("interrupted:cancelled")),
  `${fin.steps?.length ?? 0} step rows`
);

// 4. List contains the run.
const list = run("ape_agent_list", { limit: 20 });
check("list returns rows incl. this run", Array.isArray(list.runs) && list.runs.some((r) => r.run_id === runId));

// 5. Ledger tool shape (entries may be empty in a fresh dir — shape matters).
const led = run("ape_ledger", { limit: 5 });
check("ledger returns entries array", Array.isArray(led.entries), JSON.stringify(led).slice(0, 120));

// 6. Tasks graph (may fail without python/graph — failure preserved, not fatal).
try {
  const g = run("ape_orchestrate", { op: "graph" });
  if (g.ok === false || g.error) {
    console.log(`WARN  tasks graph unavailable: ${JSON.stringify(g).slice(0, 200)}`);
  } else {
    check("tasks graph returns output", typeof g.output === "string", `${(g.output ?? "").split("\n").length} lines`);
  }
} catch (e) {
  console.log(`WARN  tasks graph threw: ${String(e?.message ?? e).slice(0, 200)}`);
}

// 7. Prune dry-run is safe.
{
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("node", [bin, "prune", "--dry-run"], { encoding: "utf8", env, timeout: 30000 });
  check("prune dry-run exits 0", r.status === 0, (r.stdout ?? "").trim().slice(0, 80));
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GREEN");
process.exit(failures ? 1 : 0);
