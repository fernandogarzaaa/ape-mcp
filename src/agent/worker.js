// Agent run worker — forked per run by the MCP server so agent loops never block
// the protocol process. Reads the run row (created by the server), executes the
// reasoning loop, streams step records to runs.db, updates the run, exits.
import { loadProfile } from "./profiles.js";
import { runAgent } from "./loop.js";
import { getRun, updateRun, appendStep } from "../runs.js";

const runId = process.argv[2];
let opts = {};
try { opts = JSON.parse(process.argv[3] ?? "{}"); } catch { /* ignore */ }

if (!runId) process.exit(1);

async function main() {
  const req = getRun(runId);
  if (!req || req.status === "not_found") { process.exit(1); }
  const profile = loadProfile(req.profile);
  if (!profile) {
    updateRun(runId, { status: "failed", stop_reason: "profile_not_found", finished_at: new Date().toISOString() });
    process.exit(1);
  }
  if (opts.mockScript) profile.model = { provider: "mock", id: "mock-model" };
  const result = await runAgent({
    profile,
    objective: req.objective,
    organism_id: req.organism_id ?? "default",
    onStep: (step) => appendStep(runId, step),
    mockScript: opts.mockScript,
    mockCostPerCall: opts.mockCostPerCall,
  });
  updateRun(runId, {
    status: result.stop_reason === "model_error" ? "failed" : "done",
    stop_reason: result.stop_reason,
    step_count: result.step_count,
    total_tokens: result.total_tokens,
    total_cost: result.total_cost,
    outcome: typeof result.outcome === "string" ? result.outcome.slice(0, 4000) : JSON.stringify(result.outcome ?? null).slice(0, 4000),
    finished_at: new Date().toISOString(),
  });
  process.exit(0);
}

main().catch((e) => {
  try { updateRun(runId, { status: "failed", stop_reason: "worker_crash", outcome: String(e).slice(0, 400), finished_at: new Date().toISOString() }); } catch { /* ignore */ }
  process.exit(1);
});