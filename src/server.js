import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, openSync, closeSync, realpathSync, statSync } from "node:fs";
import { join, dirname, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { dispatch, engineFail, eveEntry, runNode, failEve, genesisEntry } from "./dispatch.js";
import { emitTrace, newTraceId, shaShort, dataDir, redactSecrets } from "./trace.js";
import { loadMods } from "./mods.js";
import { taskCreate, taskGet, taskList, taskFinish } from "./tasks.js";
import { adamCall } from "./adam-client.js";
import { loadProfile, listProfiles, describeProfile, listProfileDetails } from "./agent/profiles.js";
import { familyOf, profileHash, envFingerprint } from "./agent/outcomes.js";
import { createRun, getRun, updateRun, reconcileRuns, runningCount, spendSince, loadCheckpoint, familyStats, deprecateVariant, admitRun, claimRun, releaseRun, queryRuns, exportRun, importRun, shareRun, unshareRun, appendStep } from "./runs.js";
import { loadConnector, connectorList } from "./connectors.js";
import { detectActiveProvider, detectProviders, detectProviderSources } from "./agent/hostdetect.js";
import { defaultModelFor, resolveModel, chat, estimateCost } from "./agent/providers.js";
import { APE_VERSION } from "./version.js";

const runningAgents = new Map();

// H3 trust boundary: ape_report renders a results directory through the
// Genesis engine (which reads <dir>/verdict.json into the tool result).
// The ref must resolve inside the run-data root: no absolute escape, no
// `..` escape, no symlink escape (canonicalized before compare), and the
// target must be a directory (genesis reads verdict.json inside it, never
// an arbitrary file). Anything else is rejected with an honest error —
// the engine never sees the raw ref.
export function resolveReportRef(ref) {
  const base = dataDir();
  if (typeof ref !== "string" || !ref.trim()) {
    return { ok: false, error: "missing_ref", hint: "pass a results dir inside the run-data directory, or omit ref to list artifacts" };
  }
  const trimmed = ref.trim();
  let baseReal;
  try {
    mkdirSync(base, { recursive: true });
    baseReal = realpathSync(base);
  } catch {
    return { ok: false, error: "datadir_unavailable", hint: "run-data directory is not accessible" };
  }
  const candidate = isAbsolute(trimmed) ? trimmed : join(base, trimmed);
  let canon;
  try {
    canon = realpathSync(candidate);
  } catch {
    return { ok: false, error: "ref_not_found", ref: trimmed, hint: "no such artifact under the run-data directory" };
  }
  const inside = process.platform === "win32"
    ? canon.toLowerCase().startsWith(baseReal.toLowerCase() + sep)
    : canon.startsWith(baseReal + sep);
  if (!inside) {
    return { ok: false, error: "ref_outside_datadir", ref: trimmed, hint: "report refs must live inside the run-data directory" };
  }
  let isDir = false;
  try { isDir = statSync(canon).isDirectory(); } catch { /* handled below */ }
  if (!isDir) {
    return { ok: false, error: "ref_not_a_directory", ref: trimmed, hint: "genesis report renders a results directory (verdict.json inside)" };
  }
  return { ok: true, path: canon };
}

// Shared cancel core for ape_agent_cancel + agent/cancel: kill the worker
// (no drain), mark stopped/cancelled, append the interruption marker.
// Returns the result object; claim checks stay with the callers.
// Worker identity (M7): the in-process ChildProcess handle is exact —
// kill() on it can only ever signal our own worker. A bare worker_pid from
// the row is NEVER signaled: after a server restart the handle is gone and
// the PID may have been recycled to an unrelated process. Dead PID (probe
// fails) is safe to mark; live-but-handleless refuses with an honest error
// instead of risking a stranger.
function cancelRunCore(runId) {
  const w = runningAgents.get(runId);
  if (w) { try { w.kill(); } catch { /* already gone */ } runningAgents.delete(runId); }
  else {
    const row = getRun(runId);
    if (row.status === "running" && row.worker_pid) {
      let probedAlive = false;
      try { process.kill(row.worker_pid, 0); probedAlive = true; } catch { probedAlive = false; }
      if (probedAlive) {
        return {
          run_id: runId, uri: runUri(runId), status: row.status, stop_reason: row.stop_reason,
          error: "cancel_refused_no_handle",
          worker_pid: row.worker_pid,
          hint: "worker handle was lost (server restart); the recorded PID may have been recycled to an unrelated process, so it will not be signaled. If the old worker is truly alive it still streams to this ledger; otherwise reconcile will mark it worker_gone. Start a new run instead.",
        };
      }
      // Probe failed: nothing to kill; fall through to marking below.
    }
  }
  const run = getRun(runId);
  if (run.status !== "running") {
    return { run_id: runId, uri: runUri(runId), status: run.status, stop_reason: run.stop_reason, note: "run already finished" };
  }
  updateRun(runId, { status: "stopped", stop_reason: "cancelled", finished_at: new Date().toISOString() });
  // Minimal interruption marker, no graceful drain: the in-flight step is
  // unknowable server-side (the worker holds it), so the marker bounds it
  // honestly — after the last recorded step. Zero-value row (totals and
  // resume numbering untouched; resume reads checkpoints, not this row).
  const seen = getRun(runId).steps ?? [];
  const last = seen[seen.length - 1];
  appendStep(runId, {
    step: (last?.step ?? 0) + 1,
    kind: "cancel",
    tool: last?.tool ?? null,
    resultSummary: last
      ? `interrupted:cancelled after step ${last.step} (${last.tool || last.kind}) — in-flight work discarded, no graceful drain`
      : "interrupted:cancelled before any step — nothing was in flight",
  });
  return { run_id: runId, uri: runUri(runId), status: "stopped", stop_reason: "cancelled" };
}

// Worker spawn: detached with NO ipc channel and stdout/stderr to a per-run
// log file — never inherited pipes. An inherited stdout pipe (or fork's ipc
// channel) kept the pipe/channel open and made `ape-mcp run ape_agent_run`
// — and any caller waiting on it, including the TUI — hang until the whole
// run finished. Nothing uses IPC with workers, so spawn (not fork) is exact.
// The log preserves crash diagnostics; the parent closes its copy at once
// (no fd leak in long-lived servers). Callers keep worker_pid bookkeeping.
function spawnWorker(runId, optsJson) {
  const dir = join(dataDir(), "workers");
  mkdirSync(dir, { recursive: true });
  const logFd = openSync(join(dir, `${runId}.log`), "a");
  try {
    const child = spawn(process.execPath, [join(root, "src", "agent", "worker.js"), runId, optsJson], {
      stdio: ["ignore", logFd, logFd, "ignore"],
      detached: true,
    });
    child.unref();
    return child;
  } finally {
    closeSync(logFd);
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROTOCOL = "2026-07-28";
export { PROTOCOL };
// Versions whose wire shape this server actually speaks (stable core method
// set, valid across all of them). Negotiation picks the newest mutually
// supported version; unknown/absent requests get the pin. This is standard
// MCP negotiation, not echo: arbitrary versions are never parroted, and
// clients that only know older versions (e.g. capped at 2025-11-25) still
// connect instead of failing over to dead transports.
export const SUPPORTED_PROTOCOL_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export function negotiateProtocolVersion(requested) {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL;
}

export const TOOL_DEFS = [
  { name: "ape_status", description: "APE status: versions, vendored engines, mods", inputSchema: { type: "object", properties: { organism_id: { type: "string", description: "ADAM organism scope (default \"default\")" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_test_provider", description: "Test a model provider with one minimal call: reports success, latency, usage and cost, or the honest upstream error. Omit both args to test current resolution. Costs a fraction of a cent on real providers; free on mock.", inputSchema: { type: "object", properties: { provider: { type: "string", description: "provider to test (omit for current resolution)" }, model: { type: "string", description: "model id (omit for the provider default)" } } }, annotations: { readOnly: false, idempotent: true } },
  { name: "ape_remember", description: "Store durable memory in ADAM organism (real stdio call to vendored adam-mcp)", inputSchema: { type: "object", properties: { kind: { type: "string", description: "memory kind: episodic|semantic|procedural|self_knowledge" }, content: { type: "string", description: "what to remember" }, origin: { type: "string", description: "provenance: observation|memory|reasoning|external_source|user_assertion" }, confidence: { type: "number", description: "0-1 confidence in this memory" }, organism_id: { type: "string", description: "ADAM organism scope (default \"default\")" } }, required: ["content"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_recall", description: "Query ADAM memory + prior decisions (real stdio call to vendored adam-mcp)", inputSchema: { type: "object", properties: { query: { type: "string", description: "what to look for" }, kind: { type: "string", description: "filter by memory kind" }, top_k: { type: "number", description: "max results (default 5)" }, organism_id: { type: "string", description: "ADAM organism scope (default \"default\")" } }, required: ["query"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_beliefs", description: "List ADAM beliefs or form one from evidence (real stdio call; statement form creates a new belief)", inputSchema: { type: "object", properties: { statement: { type: "string", description: "belief to form from evidence (omit to just list)" }, origin: { type: "string", description: "evidence provenance (default \"observation\")" }, organism_id: { type: "string", description: "ADAM organism scope (default \"default\")" } } }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_genome", description: "Current ADAM genome payload (values, goals, capabilities, policies)", inputSchema: { type: "object", properties: { organism_id: { type: "string", description: "ADAM organism scope (default \"default\")" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_mcp_eval", description: "EVE mcp-eval: schema, conformance + fuzz oracles against an MCP server target", inputSchema: { type: "object", properties: { target: { type: "string", description: "MCP server target to evaluate" } }, required: ["target"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_validate_experience", description: "Run EVE human-loop simulation (personas, seeded, evidence-backed)", inputSchema: { type: "object", properties: { url: { type: "string", description: "app URL, or mock: for the offline demo" }, persona: { type: "string", description: "simulated user persona" }, goal: { type: "string", description: "task the simulated user attempts" }, seed: { type: "number", description: "reproducibility seed" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_audit_claim", description: "Genesis: evaluate claim + adversarially audit verifier (SOUND/EXPLOITABLE)", inputSchema: { type: "object", properties: { suite: { type: "string", description: "verification suite to run" }, verifier: { type: "string", description: "verifier under audit" }, spec: { type: "string", description: "claim specification" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_compare", description: "Genesis compare/regression between two run result dirs", inputSchema: { type: "object", properties: { run_a: { type: "string", description: "baseline run result dir" }, run_b: { type: "string", description: "candidate run result dir" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_orchestrate", description: "Skein task-graph: graph/node-add/claim/release/status/log with evidence gate", inputSchema: { type: "object", properties: { op: { type: "string", description: "graph|node-add|claim|release|status|log" }, node: { type: "string", description: "task node id" }, agent_id: { type: "string", description: "agent identity" }, title: { type: "string", description: "node title" }, goal: { type: "string", description: "node goal" }, context: { type: "string", description: "node context" }, constraints: { type: "string", description: "node constraints" }, completion: { type: "string", description: "completion evidence (status gate)" }, depends_on: { type: "string", description: "dependency node ids" } } }, annotations: { readOnly: false, idempotent: true } },
  { name: "ape_evolve", description: "ADAM evolution lifecycle: propose (auto-signals) -> EVE measure -> governed accept/reject (destructive: confirm)", inputSchema: { type: "object", properties: { proposal_id: { type: "string", description: "proposal under governance" }, action: { type: "string", description: "propose|accept|reject (accept is destructive: needs confirm)" }, kind: { type: "string", description: "mutation kind" }, topic: { type: "string", description: "evolution topic" }, organism_id: { type: "string", description: "ADAM organism scope (default \"default\")" } } }, annotations: { readOnly: false, destructive: true, idempotent: false } },
  { name: "ape_report", description: "Fetch report artifacts (EVE run reports, genesis ledger, genesis report render). ref must be a results directory inside the run-data directory (sandboxed: absolute escapes, .. escapes, and symlink escapes are rejected)", inputSchema: { type: "object", properties: { ref: { type: "string", description: "results dir inside the run-data directory, or omit to list artifacts" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_task_start", description: "Start any APE tool as a background task (Tasks extension); poll with ape_task_get", inputSchema: { type: "object", properties: { tool: { type: "string", description: "tool name to run in the background" }, arguments: { type: "object", description: "tool arguments object" } }, required: ["tool"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_task_get", description: "Poll a background task (running/done/failed + result)", inputSchema: { type: "object", properties: { task_id: { type: "string", description: "background task id" } }, required: ["task_id"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_profiles", description: "List available agent profiles + their declared tools and limits", inputSchema: { type: "object", properties: { } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_run", description: "Invoke an agent profile against an objective; returns run_id immediately (poll ape_agent_status). provider/model override auto-detection", inputSchema: { type: "object", properties: { profile: { type: "string", description: "agent profile name" }, objective: { type: "string", description: "what the agent should do" }, organism_id: { type: "string", description: "ADAM organism scope (default \"default\")" }, provider: { type: "string", description: "model provider override" }, model: { type: "string", description: "model id override" } }, required: ["profile", "objective"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_agent_status", description: "Poll an agent run: status, steps, cost, outcome", inputSchema: { type: "object", properties: { run_id: { type: "string", description: "run_id or ape://runs/<id> URI" } }, required: ["run_id"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_cancel", description: "Cancel a running agent run, preserving the partial ledger", inputSchema: { type: "object", properties: { run_id: { type: "string", description: "run_id or ape://runs/<id> URI" }, claimant: { type: "string", description: "operator identity; required to cancel a live run claimed by someone else" } }, required: ["run_id"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_agent_resume", description: "Resume a stopped/failed run from its last checkpoint with a replacement worker", inputSchema: { type: "object", properties: { run_id: { type: "string", description: "run_id or ape://runs/<id> URI" }, claimant: { type: "string", description: "operator identity; must hold the claim when one is set" } }, required: ["run_id"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_agent_list", description: "List agent runs with filters; the discovery primitive for cross-client handoff (returns run URIs + claim state)", inputSchema: { type: "object", properties: { status: { type: "string", description: "filter: running|done|stopped|failed" }, profile: { type: "string", description: "filter by profile name" }, parent_run_id: { type: "string", description: "filter by parent run" }, limit: { type: "number", description: "max rows, default 20, cap 100" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_claim", description: "Claim a run for this operator. Conflicts (409-class) when a live run is held by someone else; advisory (takeover allowed) on terminal runs", inputSchema: { type: "object", properties: { run_id: { type: "string", description: "run_id or ape://runs/<id> URI" }, claimant: { type: "string", description: "explicit operator identity (else APE_CLAIM_AS, else client identity)" } }, required: ["run_id"] }, annotations: { readOnly: false, idempotent: true } },
  { name: "ape_agent_release", description: "Release your claim on a run; only the holder can release", inputSchema: { type: "object", properties: { run_id: { type: "string", description: "run_id or ape://runs/<id> URI" }, claimant: { type: "string", description: "explicit operator identity (else APE_CLAIM_AS, else client identity)" } }, required: ["run_id"] }, annotations: { readOnly: false, idempotent: true } },
  { name: "ape_agent_export", description: "Export a run's full ledger slice (run row, steps, checkpoint, receipt) as a versioned, unsigned JSON bundle — the portable resume / offline-share artifact", inputSchema: { type: "object", properties: { run_id: { type: "string", description: "run_id or ape://runs/<id> URI" } }, required: ["run_id"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_import", description: "Import an ape_agent_export bundle as a NEW run with lineage linked (parent_run_id + resumes chain); plants the checkpoint so ape_agent_resume works on it", inputSchema: { type: "object", properties: { bundle: { type: ["object", "string"], description: "bundle object (or JSON string) from ape_agent_export" } }, required: ["bundle"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_agent_share", description: "Mint a read-only share link for a run: returns the raw bearer token ONCE plus its share URL, scoped to exactly that run; anyone with the URL can view the run's status, steps, and receipt", inputSchema: { type: "object", properties: { run_id: { type: "string", description: "run_id or ape://runs/<id> URI" }, label: { type: "string", description: "optional label shown on the share page" } }, required: ["run_id"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_agent_unshare", description: "Revoke share link(s) for a run: pass token to revoke one link, or all=true to revoke every live link for the run; revocation timestamps (never deletes)", inputSchema: { type: "object", properties: { run_id: { type: "string", description: "run_id or ape://runs/<id> URI" }, token: { type: "string", description: "the raw token returned by ape_agent_share" }, all: { type: "boolean", description: "revoke all live shares for the run" } }, required: ["run_id"] }, annotations: { readOnly: false, idempotent: true } },
  { name: "ape_agent_analyze", description: "Analyze a profile's recent runs and propose concrete profile edits (harness evolution from trajectories)", inputSchema: { type: "object", properties: { profile: { type: "string", description: "profile to analyze" }, window: { type: "number", description: "recent run count to consider (default 20)" }, record: { type: "boolean", description: "persist the proposed edits when true" } }, required: ["profile"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_family", description: "Cost-per-outcome + variant tracking for an outcome family (pass family id or raw objective)", inputSchema: { type: "object", properties: { family: { type: "string", description: "outcome family id" }, objective: { type: "string", description: "raw objective (alternative to family id)" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_deprecate", description: "Mark an outcome variant of a family as deprecated with a reason", inputSchema: { type: "object", properties: { family: { type: "string", description: "outcome family id" }, outcome_hash: { type: "string", description: "variant hash to deprecate" }, reason: { type: "string", description: "why this variant is deprecated" } }, required: ["family", "outcome_hash", "reason"] }, annotations: { readOnly: false, idempotent: true } },
  { name: "ape_connector_call", description: "Call a user-defined connector operation (egress-allowlisted). destructive ops need confirm", inputSchema: { type: "object", properties: { connector: { type: "string", description: "connector name" }, operation: { type: "string", description: "operation to invoke" }, input: { type: "object", description: "operation input object" }, confirm: { type: "boolean", description: "explicit confirm for destructive ops" } }, required: ["connector", "operation"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_connector_list", description: "List loaded connectors + their operations and egress hosts", inputSchema: { type: "object", properties: { } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_ledger", description: "Recent governance audit entries (destructive attempts, genesis verdicts) from ledger.jsonl — newest last, optional kind filter", inputSchema: { type: "object", properties: { limit: { type: "number", description: "max entries (default 50, cap 200)" }, kind: { type: "string", description: "substring filter on entry kind" } } }, annotations: { readOnly: true, idempotent: true } },
];

// Truncation that preserves valid JSON. Slicing a serialized string can split
// mid-token and produce unparseable output that crashes clients — instead we shorten
// the VALUE (long strings, long arrays) until it fits, so the text is always
// parseable. structuredContent carries the full result regardless.
export function safeTruncate(value, maxChars) {
  const shorten = (v, cap) => {
    if (typeof v === "string") return v.length > cap ? v.slice(0, cap) + "…[truncated]" : v;
    if (Array.isArray(v)) {
      const items = v.length > 200 ? [...v.slice(0, 200), `…[${v.length - 200} more]`] : v;
      return items.map((x) => (typeof x === "string" ? x : shorten(x, cap)));
    }
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = shorten(x, cap);
      return o;
    }
    return v;
  };
  for (const cap of [1500, 500, 150, 40]) {
    const t = shorten(value, cap);
    if (JSON.stringify(t).length <= maxChars) return t;
  }
  return { truncated: true, note: "result exceeds display budget; see structuredContent for the full result" };
}

// Canonical run handle: ape://runs/<run_id>. Accepted anywhere a run_id is
// accepted (status, cancel, resume, claim, release); ape_agent_run returns it.
export const RUN_URI_PREFIX = "ape://runs/";
export function parseRunRef(ref) {
  const s = String(ref ?? "");
  return s.startsWith(RUN_URI_PREFIX) ? s.slice(RUN_URI_PREFIX.length) : s;
}
export function runUri(runId) {
  return RUN_URI_PREFIX + runId;
}

// Claim identity (stateful protocol, phase 1): who is driving this run.
// Precedence: explicit tool arg > APE_CLAIM_AS env (or --claim-as CLI flag,
// which sets it) > MCP clientInfo.name (+ session discriminator) > "anonymous".
// Explicit names are stable across reconnects, so the same operator on a new
// machine keeps driving; the automatic fallback keeps anonymous clients
// contained to their own session.
export function resolveClaimant(provided, ctx = {}) {
  const clean = (s) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 128) : null);
  const fromArg = clean(provided);
  if (fromArg) return fromArg;
  const fromEnv = clean(process.env.APE_CLAIM_AS);
  if (fromEnv) return fromEnv;
  const ciName = clean(ctx.clientInfo?.name);
  if (ciName) {
    const disc = ctx.sessionId ? String(ctx.sessionId).slice(0, 8) : "stdio";
    return `${ciName}#${disc}`;
  }
  return "anonymous";
}

// Compact run summary for content.text: sufficient for the model to continue even
// when the host does not forward structuredContent. Full step ledger stays in
// structuredContent.result.steps.
export function runStatusSummary(result) {
  const steps = Array.isArray(result.steps) ? result.steps : [];
  const recent = steps.slice(-8).map((s) => ({
    step: s.step,
    kind: s.kind,
    tool: s.tool,
    summary: String(s.resultSummary ?? "").slice(0, 160),
  }));
  return {
    run_id: result.run_id,
    uri: runUri(result.run_id),
    status: result.status,
    stop_reason: result.stop_reason,
    model: result.model,
    resolution: result.model_resolution,
    steps: result.step_count,
    cost_usd: result.total_cost,
    tokens: result.total_tokens,
    claimant: result.claimant ?? null,
    resume_count: result.resume_count ?? 0,
    outcome: String(result.outcome ?? "").slice(0, 800),
    recent_steps: recent,
    steps_omitted: Math.max(0, steps.length - recent.length),
  };
}

// W-4: mock-test controls must never arrive via production inputs. MCP schemas
// are descriptive and extra properties are not rejected, so _mockScript /
// _mockCostPerCall are stripped unless the test-only APE_ALLOW_MOCK_INPUT=1 is
// set in the server's own environment (unreachable to remote callers).
export function stripMockInput(a) {
  if (!a || typeof a !== "object") return a;
  if (process.env.APE_ALLOW_MOCK_INPUT !== "1") {
    delete a._mockScript;
    delete a._mockCostPerCall;
  }
  return a;
}

// Resume a stopped/failed run from its last checkpoint with a replacement worker.
// Refuses live workers, finished runs, missing checkpoints, and resume-cap excess.
// Claim rule (stateful protocol): when a claim is set and the caller is not the
// holder, resume is refused — take the claim first with ape_agent_claim (advisory
// on stopped/failed runs, so handoff is one extra call). On success the claim
// transfers to the resumer: they are now driving the run.
function resumeRun(runId, workerOpts = {}, ctx = {}) {
  reconcileRuns();
  const run = getRun(runId);
  if (!run || run.status === "not_found") return { error: "run_not_found", run_id: runId };
  if (run.status === "done") return { error: "run_finished", run_id: runId, status: run.status, hint: "completed runs cannot resume" };
  const w = runningAgents.get(runId);
  if (w) return { error: "run_active", run_id: runId, hint: "a live worker owns this run; cancel first to take over" };
  if (run.status === "running") {
    if (run.worker_pid) {
      try { process.kill(run.worker_pid, 0); return { error: "run_active", run_id: runId, hint: "worker process still alive; cancel first" }; }
      catch { /* pid dead — fall through to resume */ }
    } else {
      return { error: "run_active", run_id: runId, hint: "run is marked running with no dead worker proof; cancel first" };
    }
  }
  const caller = resolveClaimant(ctx.claimant, ctx);
  if (run.claimant && run.claimant !== caller) {
    return {
      error: "claim_required", status: 403, run_id: runId, holder: run.claimant,
      hint: "this run is claimed by another operator; take the claim first with ape_agent_claim (advisory on stopped runs), then resume",
    };
  }
  const maxResumes = Number(process.env.APE_MAX_RESUMES ?? 3);
  if ((run.resumes ?? 0) >= maxResumes) {
    return { error: "resume_cap_reached", run_id: runId, resumes: run.resumes, max: maxResumes };
  }
  const cp = loadCheckpoint(runId);
  if (!cp) return { error: "no_checkpoint", run_id: runId, hint: "this run predates checkpointing or never reached a model turn" };
  const ceiling = checkRunCeilings();
  if (ceiling) return ceiling;
  const profile = loadProfile(run.profile);
  if (!profile) return { error: "profile_not_found", profile: run.profile };
  const now = new Date().toISOString();
  updateRun(runId, {
    status: "running",
    stop_reason: null,
    finished_at: null,
    resumes: (run.resumes ?? 0) + 1,
    resumed_from_step: cp.step,
    claimant: caller,
    claimed_at: now,
  });
  const worker = spawnWorker(runId, JSON.stringify({ ...workerOpts, resume: true }));
  worker.unref();
  updateRun(runId, { worker_pid: worker.pid });
  worker.on("exit", () => runningAgents.delete(runId));
  runningAgents.set(runId, worker);
  return { run_id: runId, uri: runUri(runId), status: "running", resumed_from_step: cp.step, resumes: (run.resumes ?? 0) + 1, claimant: caller, poll: "ape_agent_status" };
}

// Run-level ceilings above any single run's budget: cap concurrent forks and total
// daily spend. Env-overridable; honest errors, never silent drops.
function checkRunCeilings() {
  reconcileRuns();
  const maxConcurrent = Number(process.env.APE_MAX_CONCURRENT_RUNS ?? 4);
  if (runningCount() >= maxConcurrent) {
    return { error: "too_many_runs", running: runningCount(), max_concurrent: maxConcurrent, hint: "wait for a run to finish or raise APE_MAX_CONCURRENT_RUNS" };
  }
  const dailyCap = Number(process.env.APE_MAX_DAILY_USD ?? 25);
  if (dailyCap > 0) {
    const spent = spendSince(Date.now() - 86400000);
    if (spent >= dailyCap) {
      return { error: "daily_budget_exceeded", spent_usd: spent, daily_cap_usd: dailyCap, hint: "raise APE_MAX_DAILY_USD or wait for the window to roll" };
    }
  }
  return null;
}

export async function dispatchCall(name, args = {}, ctx = {}) {
  const t0 = Date.now();
  const traceId = ctx.traceId || newTraceId();
  const mods = await loadMods(root);
  // MCP hosts may deliver `arguments` as a JSON string (e.g. opencode) or an object.
  // Lenient-by-design contract (documented in docs/agent-instructions.md): optionals
  // fall back to schema defaults, unambiguous scalars coerce, missing required
  // args fail with named errors — never silent meaning-changing defaults.
  let a;
  if (typeof args === "string") {
    try { a = JSON.parse(args) || {}; } catch { a = {}; }
  } else {
    a = { ...(args ?? {}) };
  }
  for (const m of mods) { try { if (m.hooks?.preCall) a = (await m.hooks.preCall(name, a, ctx)) ?? a; } catch (e) { emitTrace({ traceId, tool: name, modApplied: m.name + ":preCall-error" }); } }
  // MRTR-style confirm for destructive evolve without explicit confirm
  if (name === "ape_evolve" && (a.action === "accept" || a.action === "apply") && a.confirm !== true && !ctx.headlessBypass) {
    const dur = Date.now() - t0;
    emitTrace({ traceId, tool: name, argsHash: shaShort(JSON.stringify(a)), durationMs: dur, resultSummary: "input_required:confirm" });
    return { resultType: "input_required", traceId, inputRequests: [{ id: "confirm-evolve", type: "elicitation", message: "Accepting a genome mutation is destructive. Confirm?", schema: { confirm: "boolean" } }], requestState: shaShort(traceId + name) };
  }
  let result;
  try {
    switch (name) {
      case "ape_status": {
        const base = dispatch.status(a);
        // Never expose key/token material on any tool-visible surface.
        const active = await detectActiveProvider();
        const safeActive = active ? (({ key, token, ...rest }) => rest)(active) : null;
        const sources = await detectProviderSources();
        // Which layer would decide a run right now (override/env/pin/
        // profile/auto, per field) — same resolveModel the loop uses.
        const resolved = await resolveModel({ provider: "auto", id: "auto" });
        result = {
          ...base,
          active_provider: safeActive,
          detected_providers: await detectProviders(),
          // Picker-grade inventory: provider + source + default model.
          // detected_providers stays a plain string list (unchanged shape).
          provider_sources: sources.map((s) => ({ ...s, default_model: defaultModelFor(s.provider) })),
          resolution: resolved.error
            ? { error: resolved.error, layers: resolved.layers }
            : { provider: resolved.provider, model: resolved.id, source: resolved.source, layers: resolved.layers },
        };
        break;
      }
      case "ape_test_provider": {
        // One minimal real call through the SAME resolveModel + chat the
        // loop uses (no parallel resolution path). Honest errors, never a
        // silent fallback: no credential means provider_unavailable, and
        // upstream failures surface verbatim with latency.
        const t0 = Date.now();
        const cfg = await resolveModel(
          { provider: a.provider ?? "auto", id: a.model ?? "auto" },
          a.provider ? { provider: a.provider, ...(a.model ? { model: a.model } : {}) } : {}
        );
        if (cfg.error) {
          result = { ok: false, ...cfg, latency_ms: Date.now() - t0 };
          break;
        }
        try {
          const resp = await chat(
            cfg,
            {
              system: "connection test: reply with exactly the word ok",
              messages: [{ role: "user", content: "ok?" }],
              tools: [],
              timeoutMs: 30000,
            }
          );
          const usage = resp.usage ?? { inputTokens: 0, outputTokens: 0 };
          result = {
            ok: true,
            provider: cfg.provider,
            model: cfg.id,
            source: cfg.source,
            resolution: cfg.resolution,
            latency_ms: Date.now() - t0,
            usage,
            cost_usd: estimateCost(cfg.id, usage),
            reply: String(resp.content ?? "").slice(0, 200),
          };
        } catch (e) {
          result = {
            ok: false,
            provider: cfg.provider,
            model: cfg.id,
            latency_ms: Date.now() - t0,
            error: "upstream_error",
            // Upstream errors sometimes echo credentials; redact before
            // the message is displayed, traced, or stored anywhere.
            message: redactSecrets(String(e?.message ?? e)).slice(0, 400),
            hint: "upstream failure: check key, model id, and network",
          };
        }
        break;
      }
      case "ape_remember": result = await adamCall("adam_memory_store", { kind: a.kind || "episodic", content: a.content, origin: a.origin || "observation", confidence: a.confidence ?? 0.9 }, a.organism_id); break;      case "ape_recall": result = await adamCall("adam_memory_query", { query: a.query, kind: a.kind, top_k: a.top_k ?? 5 }, a.organism_id); break;
      case "ape_beliefs": result = await adamCall("adam_beliefs", a.statement ? { statement: a.statement, origin: a.origin || "observation" } : {}, a.organism_id); break;
      case "ape_genome": result = await adamCall("adam_genome", {}, a.organism_id); break;
      case "ape_mcp_eval": {
        const e = eveEntry();
        result = e ? await runNode(e, ["mcp-eval", a.target]) : failEve();
        break;
      }
      case "ape_validate_experience": result = await dispatch.validate_experience(a); break;
      case "ape_audit_claim": result = await dispatch.audit_claim(a); break;
      case "ape_compare": result = await dispatch.compare(a); break;
      case "ape_orchestrate": result = await dispatch.orchestrate(a); break;
      case "ape_evolve": {
        const org = a.organism_id || "default";
        if (a.action === "accept" || a.action === "apply") {
          result = await adamCall("adam_accept_mutation", { proposal_id: a.proposal_id }, org);
        } else if (a.action === "reject") {
          result = await adamCall("adam_reject_mutation", { proposal_id: a.proposal_id }, org);
        } else if (a.action === "propose") {
          result = await adamCall("adam_propose_mutation", { kind: a.kind || "amend_genome", topic: a.topic }, org);
        } else {
          result = await adamCall("adam_evolve", a, org);
        }
        break;
      }
      case "ape_report": {
        if (a.ref) {
          const gate = resolveReportRef(a.ref);
          if (!gate.ok) {
            result = { error: gate.error, ref: a.ref, hint: gate.hint };
            emitTrace({ traceId, tool: name, resultSummary: `rejected:${gate.error}` });
          } else {
            const e = genesisEntry();
            result = e ? await runNode(e, ["report", gate.path]) : engineFail("genesis", "dist not built; run npm run build in vendors/genesis");
          }
        } else {
          const dir = dataDir();
          const names = ["eve-report", "ledger.jsonl", "genesis-ledger.db", "tasks.json"];
          const artifacts = names.map((n) => ({ name: n, present: existsSync(join(dir, n)), uri: n === "eve-report" ? "report://eve/latest" : n === "ledger.jsonl" ? "ledger://ape" : n === "genesis-ledger.db" ? "ledger://genesis" : "tasks://current" }));
          result = { ref: a.ref ?? "latest", artifacts, dataDir: dir };
        }
        break;
      }
      case "ape_task_start": {
        const inner = a.tool;
        if (!TOOL_DEFS.find((t) => t.name === inner) || inner === "ape_task_start") { result = { error: "unknown_tool", name: inner }; break; }
        const id = taskCreate(inner, a.arguments ?? {});
        setImmediate(async () => {
          try {
            const r = await dispatchCall(inner, a.arguments ?? {}, { ...ctx, viaTask: id });
            taskFinish(id, r);
          } catch (e) { taskFinish(id, null, String(e).slice(0, 300)); }
        });
        result = { task_id: id, status: "running", poll: "ape_task_get" };
        break;
      }
      case "ape_task_get": result = taskGet(a.task_id); break;
      case "ape_agent_profiles": {
        result = { profiles: listProfileDetails() };
        break;
      }
      case "ape_agent_run": {
        const profile = loadProfile(a.profile);
        if (!profile) { result = { error: "profile_not_found", profile: a.profile, available: listProfiles() }; break; }
        stripMockInput(a);
        // Atomic admission (ceilings + insert in one transaction — no overshoot).
        reconcileRuns();
        const admitted = admitRun({ profile: a.profile, model: profile.model.id, objective: a.objective, organism_id: a.organism_id ?? "default", outcome_family: familyOf(a.objective), profile_hash: profileHash(profile), env_hash: envFingerprint(connectorList()), maxConcurrent: Number(process.env.APE_MAX_CONCURRENT_RUNS ?? 4), dailyCapUsd: Number(process.env.APE_MAX_DAILY_USD ?? 25) });
        if (admitted.error) { result = admitted; break; }
        const runId = admitted.run_id;
        const worker = spawnWorker(runId, JSON.stringify({ mockScript: a._mockScript, mockCostPerCall: a._mockCostPerCall, provider: a.provider, model: a.model }));
        worker.unref();
        updateRun(runId, { worker_pid: worker.pid });
        worker.on("exit", () => runningAgents.delete(runId));
        runningAgents.set(runId, worker);
        result = { run_id: runId, uri: runUri(runId), status: "running", profile: a.profile, poll: "ape_agent_status" };
        break;
      }
      case "ape_agent_status":
        reconcileRuns();
        result = getRun(parseRunRef(a.run_id));
        break;
      case "ape_agent_cancel": {
        const runId = parseRunRef(a.run_id);
        const run = getRun(runId);
        // Claim rule: a live run held by someone else can only be cancelled
        // by the holder. No claim set -> current behavior unchanged.
        const me = resolveClaimant(a.claimant, ctx);
        if (run.status === "running" && run.claimant && run.claimant !== me) {
          result = {
            error: "claim_required", status: 403, run_id: runId, holder: run.claimant,
            hint: "this live run is claimed by another operator; cancel as the holder (--claim-as) or have the holder release it",
          };
          break;
        }
        result = cancelRunCore(runId);
        break;
      }
      case "ape_agent_resume": {
        stripMockInput(a);
        result = resumeRun(parseRunRef(a.run_id), { mockScript: a._mockScript, mockCostPerCall: a._mockCostPerCall, provider: a.provider, model: a.model }, { ...ctx, claimant: a.claimant });
        break;
      }
      case "ape_agent_list": {
        reconcileRuns();
        result = { runs: queryRuns({ status: a.status, profile: a.profile, parent_run_id: a.parent_run_id, limit: a.limit }) };
        break;
      }
      case "ape_agent_claim": {
        const runId = parseRunRef(a.run_id);
        result = claimRun(runId, resolveClaimant(a.claimant, ctx));
        break;
      }
      case "ape_agent_release": {
        const runId = parseRunRef(a.run_id);
        result = releaseRun(runId, resolveClaimant(a.claimant, ctx));
        break;
      }
      case "ape_agent_export": {
        result = exportRun(parseRunRef(a.run_id));
        break;
      }
      case "ape_agent_import": {
        let bundle = a.bundle;
        if (typeof bundle === "string") {
          try { bundle = JSON.parse(bundle); }
          catch { result = { error: "invalid_bundle", hint: "bundle string is not valid JSON" }; break; }
        }
        result = importRun(bundle);
        break;
      }
      case "ape_agent_share": {
        result = shareRun(parseRunRef(a.run_id), { label: a.label });
        break;
      }
      case "ape_agent_unshare": {
        result = unshareRun(parseRunRef(a.run_id), { token: a.token, all: a.all === true });
        break;
      }
      case "ape_agent_analyze": {
        const { analyzeProfile, recordAnalysis } = await import("./agent/analyze.js");
        const analysis = analyzeProfile(a.profile, { window: Number(a.window ?? 20) });
        if (a.record === true && !analysis.error) {
          analysis.recorded = await recordAnalysis(a.profile, analysis, a.organism_id);
        }
        result = analysis;
        break;
      }
      case "ape_agent_family": {
        // Cost-per-outcome + variant tracking for one outcome family (or an
        // objective, which is normalized to its family automatically).
        const family = a.family ?? familyOf(a.objective ?? "");
        result = familyStats(family);
        break;
      }
      case "ape_agent_deprecate": {
        if (!a.family || !a.outcome_hash || !a.reason) { result = { error: "missing_args", need: ["family", "outcome_hash", "reason"] }; break; }
        result = deprecateVariant({ family: a.family, outcome_hash: a.outcome_hash, reason: a.reason });
        break;
      }
      case "ape_connector_list": {
        result = { connectors: connectorList().map((c) => ({ name: c.name, source: c.source, egress_allow: c.egress_allow, operations: c.operations.map((o) => ({ name: o.name, method: o.method, path: o.path, annotations: o.annotations })) })) };
        break;
      }
      case "ape_ledger": {
        // Same read the browser console's /api/ledger serves: governance
        // audit stream (destructive attempts, genesis verdicts). No console
        // process needed — plain file read in shared dispatch.
        const limit = Math.min(Math.max(Number(a.limit ?? 50) || 50, 1), 200);
        const kindFilter = typeof a.kind === "string" && a.kind ? a.kind : null;
        const p = join(dataDir(), "ledger.jsonl");
        if (!existsSync(p)) {
          result = { entries: [], note: "no entries yet" };
          break;
        }
        let entries = [];
        try {
          entries = readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => {
            try { return JSON.parse(l); } catch { return { raw: l.slice(0, 300) }; }
          });
        } catch (e) {
          result = { error: "ledger_unreadable", hint: String(e?.message ?? e).slice(0, 200) };
          break;
        }
        if (kindFilter) entries = entries.filter((e) => String(e?.kind ?? "").includes(kindFilter));
        const total = entries.length;
        entries = entries.slice(-limit);
        result = { entries, returned: entries.length, truncated: total > entries.length };
        break;
      }
      case "ape_connector_call": {
        const conn = loadConnector(a.connector);
        if (!conn) { result = { error: "connector_not_found", connector: a.connector, available: connectorList().map((c) => c.name) }; break; }
        const op = conn.operations.find((o) => o.name === a.operation);
        if (!op) { result = { error: "connector_unknown_operation", connector: a.connector, operations: conn.operations.map((o) => o.name) }; break; }
        if (op.annotations?.destructive && a.confirm !== true && !ctx.headlessBypass) {
          emitTrace({ traceId, tool: name, resultSummary: "input_required:connector-confirm" });
          return { resultType: "input_required", traceId, inputRequests: [{ id: "confirm-connector", type: "elicitation", message: `Connector ${a.connector} operation ${a.operation} is destructive. Confirm?`, schema: { confirm: "boolean" } }], requestState: shaShort(traceId + name) };
        }
        result = await (await import("./connectors.js")).runConnectorOperation(conn, op, a.input ?? {}, { ...ctx, confirm: a.confirm === true });
        break;
      }
      default: throw Object.assign(new Error(`unknown_tool: ${name}`), { code: -32602 });
    }
  } catch (e) {
    // A coded throw from the switch above (unknown tool) is a protocol-level
    // rejection, not a handler failure: let it reach the transport, which
    // maps numeric codes to JSON-RPC errors. Everything else becomes an
    // honest handler_failed envelope (tool-level, isError).
    if (typeof e?.code === "number") throw e;
    result = { error: "handler_failed", message: String(e).slice(0, 300) };
  }
  for (const m of mods) { try { if (m.hooks?.postCall) result = (await m.hooks.postCall(name, a, result, ctx)) ?? result; } catch { /* mods never break core */ } }
  // Display payload: for run status with many steps, emit a compact SUMMARY the model
  // can act on from content.text alone (hosts are not required to forward
  // structuredContent). structuredContent always carries the full record.
  const display = (name === "ape_agent_status" && Array.isArray(result?.steps) && result.steps.length > 8)
    ? runStatusSummary(result)
    : safeTruncate(result, 4000);
  const out = {
    resultType: "complete", traceId,
    content: [{ type: "text", text: JSON.stringify(display) }],
    structuredContent: { tool: name, ok: !result?.error, result },
  };
  emitTrace({ traceId, tool: name, argsHash: shaShort(JSON.stringify(args)), handles: a.organism_id ?? a.node ?? "", durationMs: Date.now() - t0, resultSummary: JSON.stringify(result).slice(0, 200), modApplied: mods.map((m) => m.name).join(",") });
  return out;
}

export function toolsList() {
  return { protocol: PROTOCOL, tools: [...TOOL_DEFS].sort((a, b) => a.name.localeCompare(b.name)), ttlMs: 60000, cacheScope: "public" };
}

const RESOURCES = [
  { uri: "genome://current", name: "genome", description: "Current ADAM genome payload", mimeType: "application/json" },
  { uri: "ledger://genesis", name: "genesis-ledger", description: "Genesis hash-chained audit ledger", mimeType: "application/json" },
  { uri: "ledger://ape", name: "ape-ledger", description: "APE run/ledger summaries", mimeType: "application/json" },
  { uri: "graph://skein/current", name: "skein-graph", description: "Current Skein task graph", mimeType: "application/json" },
  { uri: "tasks://current", name: "tasks", description: "Background task list", mimeType: "application/json" },
];
const PROMPTS = [
  { name: "ape-triage", description: "Triage an issue: recall prior decisions, verify, store the outcome", arguments: [{ name: "topic", required: true }] },
  { name: "ape-validate", description: "Run a seeded EVE validation and store the decision", arguments: [{ name: "url", required: true }] },
  { name: "ape-audit", description: "Audit a verifier with Genesis and record the verdict", arguments: [{ name: "verifier", required: true }] },
];

export function resourcesList() {
  return { resources: RESOURCES };
}
export function promptsList() {
  return { prompts: PROMPTS };
}
export async function readResource(uri) {
  if (uri === "genome://current") {
    const g = await adamCall("adam_genome", {}, "default");
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(g).slice(0, 8000) }] };
  }
  if (uri === "ledger://genesis" || uri === "ledger://ape") {
    const dir = dataDir();
    const file = uri === "ledger://genesis" ? "genesis-ledger.db" : "ledger.jsonl";
    const p = join(dir, file);
    if (!existsSync(p)) return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ present: false, hint: "no entries yet" }) }] };
    if (file.endsWith(".jsonl")) {
      const lines = readFileSync(p, "utf8").split("\n").filter(Boolean).slice(-20);
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(lines.map((l) => { try { return JSON.parse(l); } catch { return l; } })) }] };
    }
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ present: true, path: p, note: "sqlite ledger; query via ape_report" }) }] };
  }
  if (uri === "graph://skein/current") {
    const g = await dispatch.orchestrate({ op: "graph" });
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(g).slice(0, 8000) }] };
  }
  if (uri === "tasks://current") {
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(taskList()) }] };
  }
  throw Object.assign(new Error(`resource not found: ${uri}`), { code: -32002 });
}
export async function getPrompt(name, args = {}) {
  const bodies = {
    "ape-triage": `Triage "${args.topic ?? "{topic}"}": first call ape_recall with the topic, then verify with the relevant engine tool, then ape_remember the decision. Never claim completion without evidence.`,
    "ape-validate": `Validate "${args.url ?? "{url}"}" with ape_validate_experience (always pass a seed), then ape_remember the decision with the seed and persona.`,
    "ape-audit": `Audit verifier "${args.verifier ?? "{verifier}"}" with ape_audit_claim, record the verdict, and append the ledger entry reference.`,
  };
  if (!bodies[name]) throw Object.assign(new Error(`unknown prompt: ${name}`), { code: -32602 });
  return { messages: [{ role: "user", content: { type: "text", text: bodies[name] } }] };
}
export function discover() {
  return {
    protocol: PROTOCOL,
    server: { name: "ape-mcp", version: APE_VERSION },
    // Honest wire contract (dual-era): newline-delimited JSON-RPC over stdio
    // with the legacy method set (initialize/tools/list/tools/call/...) plus
    // modern server/discover. Stateless — no session ids. This is NOT a
    // wire-complete native 2026-07-28 transport; clients must not assume
    // wire semantics beyond what is declared here.
    transport: {
      stdio: "newline-delimited JSON-RPC",
      handshake: ["initialize", "server/discover"],
      sessions: "stateless",
      wire: "legacy-shaped method set + modern discovery (dual-era)",
    },
    capabilities: {
      tools: {}, resources: {}, prompts: {},
      extensions: {
        "io.modelcontextprotocol/tasks": {},
        "dev.ape/agent": { version: "0.1" },
      },
    },
  };
}

// dev.ape/agent extension methods (also reachable as tools for extension-blind hosts).
export async function agentMethod(method, params = {}) {
  switch (method) {
    case "agent/listProfiles":
      return { profiles: listProfileDetails() };
    case "agent/describeProfile":
      return describeProfile(params.profile) ?? { error: "profile_not_found", profile: params.profile, available: listProfiles() };
    case "agent/run": {
      const profile = loadProfile(params.profile);
      if (!profile) return { error: "profile_not_found", profile: params.profile, available: listProfiles() };
      stripMockInput(params);
      reconcileRuns();
      const admitted = admitRun({ profile: params.profile, model: profile.model.id, objective: params.objective, organism_id: params.organism_id ?? "default", outcome_family: familyOf(params.objective), profile_hash: profileHash(profile), env_hash: envFingerprint(connectorList()), maxConcurrent: Number(process.env.APE_MAX_CONCURRENT_RUNS ?? 4), dailyCapUsd: Number(process.env.APE_MAX_DAILY_USD ?? 25) });
      if (admitted.error) return admitted;
      const runId = admitted.run_id;
      const worker = spawnWorker(runId, JSON.stringify({ mockScript: params._mockScript, mockCostPerCall: params._mockCostPerCall, provider: params.provider, model: params.model }));
      worker.unref();
      updateRun(runId, { worker_pid: worker.pid });
      worker.on("exit", () => runningAgents.delete(runId));
      runningAgents.set(runId, worker);
      return { run_id: runId, uri: runUri(runId), status: "running", profile: params.profile };
    }
    case "agent/getRun":
      reconcileRuns();
      return getRun(parseRunRef(params.run_id));
    case "agent/cancel": {
      const runId = parseRunRef(params.run_id);
      const run = getRun(runId);
      const me = resolveClaimant(params.claimant, {});
      if (run.status === "running" && run.claimant && run.claimant !== me) {
        return { error: "claim_required", status: 403, run_id: runId, holder: run.claimant, hint: "this live run is claimed by another operator" };
      }
      return cancelRunCore(runId);
    }
    case "agent/resume":
      return resumeRun(parseRunRef(params.run_id), { mockScript: params._mockScript, mockCostPerCall: params._mockCostPerCall, provider: params.provider, model: params.model }, { claimant: params.claimant });
    case "agent/claim": {
      const runId = parseRunRef(params.run_id);
      return claimRun(runId, resolveClaimant(params.claimant, {}));
    }
    case "agent/release": {
      const runId = parseRunRef(params.run_id);
      return releaseRun(runId, resolveClaimant(params.claimant, {}));
    }
    case "agent/share":
      return shareRun(parseRunRef(params.run_id), { label: params.label });
    case "agent/unshare":
      return unshareRun(parseRunRef(params.run_id), { token: params.token, all: params.all === true });
    case "agent/listRuns":
      reconcileRuns();
      return { runs: queryRuns({ status: params.status, profile: params.profile, parent_run_id: params.parent_run_id, limit: params.limit }) };
    case "agent/export":
      return exportRun(parseRunRef(params.run_id));
    case "agent/import": {
      let bundle = params.bundle;
      if (typeof bundle === "string") {
        try { bundle = JSON.parse(bundle); }
        catch { return { error: "invalid_bundle", hint: "bundle string is not valid JSON" }; }
      }
      return importRun(bundle);
    }
    default:
      return { error: "unknown_method", method };
  }
}