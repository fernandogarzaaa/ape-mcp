// M0 snapshot capture: one REAL mock run through the REAL entrypoint
// (`ape-mcp run ape_agent_run` -> detached worker -> ape_agent_status polls).
// No API key: mock provider + APE_ALLOW_MOCK_INPUT. Writes snapshots/
// real-status.json for the Rust snapshot harness (which normalizes run ids).
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "ape-mcp.js");
const env = {
  ...process.env,
  APE_ALLOW_MOCK_INPUT: "1",
  APE_DATA_DIR: mkdtempSync(join(tmpdir(), "ape-tui-snap-")),
  APE_MAX_CONCURRENT_RUNS: "32",
  APE_MAX_DAILY_USD: "1000000",
};
const run = (args) =>
  JSON.parse(execFileSync("node", [bin, ...args], { encoding: "utf8", env, timeout: 60000 }));

const script = [
  { tool: "skein.orchestrate", args: { op: "status" } },
  { tool: "memory.recall", args: { query: "prior" } },
  { tool: "memory.store", args: { content: "snapshot probe" } },
  { tool: "skein.orchestrate", args: { op: "status" } },
  { tool: "memory.recall", args: { query: "probe" } },
  { tool: "skein.orchestrate", args: { op: "status" } },
  { tool: "memory.recall", args: { query: "again" } },
  { tool: "finish", args: { summary: "snapshot ok" } },
];
const started = run(["run", "ape_agent_run", JSON.stringify({ profile: "repo-triage", objective: "snapshot probe", _mockScript: script })]);
const runId = started.structuredContent.result.run_id;
if (!runId) throw new Error("no run_id: " + JSON.stringify(started).slice(0, 300));

const samples = [];
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 50));
  const st = run(["run", "ape_agent_status", JSON.stringify({ run_id: runId })]).structuredContent.result;
  if (!samples.length || st.status !== samples[samples.length - 1].status || (st.steps?.length ?? 0) !== (samples[samples.length - 1].steps?.length ?? 0)) {
    samples.push(st);
  }
  if (st.status === "done" || st.status === "failed" || st.status === "stopped") break;
}
const out = { run_id: runId, samples };
writeFileSync(join(root, "snapshots", "real-status.json"), JSON.stringify(out, null, 2));
console.log(`captured ${samples.length} states for ${runId} -> snapshots/real-status.json`);
