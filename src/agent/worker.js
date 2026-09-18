// Agent run worker — forked per run by the MCP server so agent loops never block
// the protocol process. Reads the run row (created by the server), executes the
// reasoning loop, streams step records to runs.db, updates the run, writes an outcome
// memory (so future runs can recall it without the model having to store one), exits.
import { loadProfile } from "./profiles.js";
import { runAgent } from "./loop.js";
import { resolveModel } from "./providers.js";
import { getRun, updateRun, appendStep } from "../runs.js";
import { adamCall } from "../adam-client.js";

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
  // Resolve the model once at run start (explicit override → provider:auto detection).
  const resolved = await resolveModel(profile.model, { provider: opts.provider, model: opts.model });
  if (resolved.error) {
    updateRun(runId, {
      status: "failed",
      stop_reason: "no_provider",
      outcome: `provider resolution failed: ${resolved.error} (${(resolved.hint ?? "").slice(0, 200)})`,
      finished_at: new Date().toISOString(),
    });
    process.exit(1);
  }
  const result = await runAgent({
    profile,
    objective: req.objective,
    organism_id: req.organism_id ?? "default",
    onStep: (step) => appendStep(runId, step),
    mockScript: opts.mockScript,
    mockCostPerCall: opts.mockCostPerCall,
    resolvedModel: resolved,
  });
  updateRun(runId, {
    status: result.stop_reason === "model_error" ? "failed" : "done",
    stop_reason: result.stop_reason,
    step_count: result.step_count,
    total_tokens: result.total_tokens,
    total_cost: result.total_cost,
    model: result.model_provider + "/" + result.model,
    model_resolution: result.model_resolution,
    outcome: typeof result.outcome === "string" ? result.outcome.slice(0, 4000) : JSON.stringify(result.outcome ?? null).slice(0, 4000),
    finished_at: new Date().toISOString(),
  });
  // Structural feedback loop (not gated on the model calling memory.store): every run
  // leaves an outcome record the next run on a similar objective can recall.
  try {
    const summary = `run ${req.profile}: objective="${String(req.objective).slice(0, 200)}" stop=${result.stop_reason} steps=${result.step_count} cost=$${Number(result.total_cost).toFixed(4)} model=${result.model_provider}/${result.model} outcome="${String(typeof result.outcome === "string" ? result.outcome : JSON.stringify(result.outcome ?? "")).slice(0, 300)}"`;
    await adamCall("adam_memory_store", { kind: "episodic", content: summary, origin: "observation", confidence: 0.8 }, req.organism_id ?? "default");
  } catch { /* outcome memory is best-effort; the run already succeeded */ }
  process.exit(0);
}

main().catch((e) => {
  try { updateRun(runId, { status: "failed", stop_reason: "worker_crash", outcome: String(e).slice(0, 400), finished_at: new Date().toISOString() }); } catch { /* ignore */ }
  process.exit(1);
});