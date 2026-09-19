// Agent run worker — forked per run by the MCP server so agent loops never block
// the protocol process. Reads the run row (created by the server), executes the
// reasoning loop, streams step records to runs.db, updates the run, writes an outcome
// memory (so future runs can recall it without the model having to store one), exits.
import { loadProfile } from "./profiles.js";
import { runAgent } from "./loop.js";
import { resolveModel } from "./providers.js";
import { detectProviders } from "./hostdetect.js";
import { classifyObjective, selectRoutedModel } from "./router.js";
import { rankBySimilarity, buildHydrationContext } from "./similarity.js";
import { familyOf } from "./outcomes.js";
import { getRun, updateRun, appendStep, recentRuns, saveCheckpoint, loadCheckpoint, findDuplicate } from "../runs.js";
import { adamCall } from "../adam-client.js";

const runId = process.argv[2];
let opts = {};
try { opts = JSON.parse(process.argv[3] ?? "{}"); } catch { /* ignore */ }

if (!runId) process.exit(1);

// Structural recall: fetch similar past outcomes BEFORE the loop starts, so the
// model doesn't have to remember to call memory.recall. Best-effort; a miss
// simply means no hydration (the run proceeds normally).
async function hydrateContext(objective, organismId) {
  try {
    const r = await adamCall("adam_memory_query", { query: String(objective).slice(0, 500), top_k: 5 }, organismId);
    if (r._adam !== "ok") return null;
    const candidates = (r.result ?? []).map((c, i) => ({ id: i, text: c?.text ?? "" })).filter((c) => c.text);
    if (!candidates.length) return null;
    return buildHydrationContext(objective, candidates);
  } catch { return null; }
}

async function main() {
  const req = getRun(runId);
  if (!req || req.status === "not_found") { process.exit(1); }
  const profile = loadProfile(req.profile);
  if (!profile) {
    updateRun(runId, { status: "failed", stop_reason: "profile_not_found", finished_at: new Date().toISOString() });
    process.exit(1);
  }
  if (opts.mockScript) profile.model = { provider: "mock", id: "mock-model" };
  // Outcome dedup: the same objective completed recently for this organism reuses
  // the prior receipt instead of burning model cost again. Window from policy
  // (dedup_window_sec, default 3600, 0 = off). Skipped on resume and mock runs.
  if (!opts.resume && !opts.mockScript) {
    const family = familyOf(req.objective);
    updateRun(runId, { outcome_family: family });
    const dup = findDuplicate({
      family,
      organism_id: req.organism_id ?? "default",
      windowSec: Number(profile.policy?.dedup_window_sec ?? 3600),
      excludeRunId: runId,
    });
    if (dup) {
      let priorReceipt = null;
      try { priorReceipt = JSON.parse(dup.receipt ?? "null"); } catch { /* ignore */ }
      updateRun(runId, {
        status: "done",
        stop_reason: "dedup_reuse",
        step_count: 0,
        total_tokens: 0,
        total_cost: 0,
        outcome_hash: dup.outcome_hash,
        receipt: JSON.stringify({ ...(priorReceipt ?? {}), run_id: runId, dedup: { reused: true, prior_run_id: dup.run_id } }).slice(0, 2000),
        outcome: `reused outcome of ${dup.run_id} (same family, finished ${dup.finished_at})`,
        finished_at: new Date().toISOString(),
      });
      process.exit(0);
    }
  }
  // Task-based routing (opt-out via policy.routing: false or explicit provider/model):
  // trivial objectives go local when a local model is detected; otherwise normal
  // resolution. The decision is recorded in the receipt for later judgment.
  let routing = { routed: false, category: "general", confidence: 0, reason: "routing skipped" };
  let resolved = null;
  const routingOn = (profile.policy?.routing ?? true) && profile.model.provider === "auto" && !opts.provider && !opts.model && !opts.mockScript;
  if (routingOn) {
    const cls = classifyObjective(req.objective);
    routing = { routed: false, category: cls.category, confidence: cls.confidence, reason: cls.reasons.join("; ") };
    if (cls.category === "trivial" && cls.confidence > 0) {
      const detected = await detectProviders();
      const routed = await selectRoutedModel(cls.category, {
        detected,
        resolveProvider: (p) => resolveModel({ provider: p, id: "auto" }),
      });
      if (routed) {
        resolved = routed;
        routing = { routed: true, category: cls.category, confidence: cls.confidence, reason: routed.routeReason, provider: routed.provider, model: routed.id };
      }
    }
  }
  if (!resolved) {
    // Resolve the model once at run start (explicit override → provider:auto detection).
    resolved = await resolveModel(profile.model, { provider: opts.provider, model: opts.model });
  }
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
    onCheckpoint: (state) => saveCheckpoint(runId, state.budget?.steps ?? 0, state),
    mockScript: opts.mockScript,
    mockCostPerCall: opts.mockCostPerCall,
    resolvedModel: resolved,
    routing,
    initial: opts.resume ? loadCheckpoint(runId)?.state ?? null : null,
    // Mock runs are hermetic replays: no ADAM I/O (also keeps test workers fast).
    initialContext: (opts.resume || opts.mockScript) ? null : await hydrateContext(req.objective, req.organism_id ?? "default"),
  });
  updateRun(runId, {
    status: result.stop_reason === "model_error" ? "failed" : "done",
    stop_reason: result.stop_reason,
    step_count: result.step_count,
    total_tokens: result.total_tokens,
    total_cost: result.total_cost,
    model: result.model_provider + "/" + result.model,
    model_resolution: result.model_resolution,
    unverified: result.unverified ? 1 : 0,
    outcome_family: result.receipt.family ?? familyOf(req.objective),
    outcome_hash: result.receipt.outcome_hash ?? null,
    receipt: JSON.stringify({ ...result.receipt, run_id: runId }).slice(0, 2000),
    outcome: typeof result.outcome === "string" ? result.outcome.slice(0, 4000) : JSON.stringify(result.outcome ?? null).slice(0, 4000),
    finished_at: new Date().toISOString(),
  });
  // Structural feedback loop (not gated on the model calling memory.store): every run
  // leaves an outcome record the next run on a similar objective can recall.
  try {
    const summary = `run ${req.profile}: objective="${String(req.objective).slice(0, 200)}" stop=${result.stop_reason} steps=${result.step_count} cost=$${Number(result.total_cost).toFixed(4)} model=${result.model_provider}/${result.model} outcome="${String(typeof result.outcome === "string" ? result.outcome : JSON.stringify(result.outcome ?? "")).slice(0, 300)}"`;
    await adamCall("adam_memory_store", { kind: "episodic", content: summary, origin: "observation", confidence: 0.8 }, req.organism_id ?? "default");
  } catch { /* outcome memory is best-effort; the run already succeeded */ }
  // Genome-mutation feedback: consecutive failures for one profile propose an
  // investigation (fires once per streak, when the count hits the threshold).
  try {
    await maybeProposeFromFailures(req.profile, req.organism_id ?? "default");
  } catch { /* feedback is best-effort */ }
  process.exit(0);
}

main().catch((e) => {
  try { updateRun(runId, { status: "failed", stop_reason: "worker_crash", outcome: String(e).slice(0, 400), finished_at: new Date().toISOString() }); } catch { /* ignore */ }
  process.exit(1);
});

const FAILURE_REASONS = new Set(["model_error", "no_provider", "worker_crash", "worker_gone", "repetition_detected", "error_spiral"]);

async function maybeProposeFromFailures(profileName, organismId) {
  const threshold = Number(process.env.APE_FEEDBACK_THRESHOLD ?? 3);
  if (!(threshold > 0)) return;
  const recent = recentRuns(profileName, threshold + 2);
  let streak = 0;
  for (const r of recent) {
    if (r.status === "failed" || FAILURE_REASONS.has(r.stop_reason)) streak++;
    else break;
  }
  // Fire exactly once per streak: only when the count HITS the threshold.
  if (streak !== threshold) return;
  const reasons = recent.slice(0, threshold).map((r) => r.stop_reason).join(", ");
  await adamCall("adam_propose_mutation", {
    kind: "investigate_conflict",
    topic: `profile ${profileName} failed ${threshold} consecutive runs (${reasons})`,
    rationale: "agent harness feedback: repeated run failures for one profile",
  }, organismId);
}