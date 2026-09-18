import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import { dispatch, engineFail, eveEntry, runNode, failEve, genesisEntry } from "./dispatch.js";
import { emitTrace, newTraceId, shaShort, dataDir } from "./trace.js";
import { loadMods } from "./mods.js";
import { taskCreate, taskGet, taskList, taskFinish } from "./tasks.js";
import { adamCall } from "./adam-client.js";
import { loadProfile, listProfiles, describeProfile } from "./agent/profiles.js";
import { createRun, getRun, updateRun } from "./runs.js";
import { loadConnector, connectorList } from "./connectors.js";
import { detectActiveProvider, detectProviders } from "./agent/hostdetect.js";

const runningAgents = new Map();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROTOCOL = "2026-07-28";

export const TOOL_DEFS = [
  { name: "ape_status", description: "APE status: versions, vendored engines, mods", inputSchema: { type: "object", properties: { organism_id: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_remember", description: "Store durable memory in ADAM organism (real stdio call to vendored adam-mcp)", inputSchema: { type: "object", properties: { kind: { type: "string" }, content: { type: "string" }, origin: { type: "string" }, confidence: { type: "number" }, organism_id: { type: "string" } }, required: ["content"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_recall", description: "Query ADAM memory + prior decisions (real stdio call to vendored adam-mcp)", inputSchema: { type: "object", properties: { query: { type: "string" }, kind: { type: "string" }, top_k: { type: "number" }, organism_id: { type: "string" } }, required: ["query"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_beliefs", description: "List ADAM beliefs or form one from evidence (real stdio call; statement form creates a new belief)", inputSchema: { type: "object", properties: { statement: { type: "string" }, origin: { type: "string" }, organism_id: { type: "string" } } }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_genome", description: "Current ADAM genome payload (values, goals, capabilities, policies)", inputSchema: { type: "object", properties: { organism_id: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_mcp_eval", description: "EVE mcp-eval: schema, conformance + fuzz oracles against an MCP server target", inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_validate_experience", description: "Run EVE human-loop simulation (personas, seeded, evidence-backed)", inputSchema: { type: "object", properties: { url: { type: "string" }, persona: { type: "string" }, goal: { type: "string" }, seed: { type: "number" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_audit_claim", description: "Genesis: evaluate claim + adversarially audit verifier (SOUND/EXPLOITABLE)", inputSchema: { type: "object", properties: { suite: { type: "string" }, verifier: { type: "string" }, spec: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_compare", description: "Genesis compare/regression between two run result dirs", inputSchema: { type: "object", properties: { run_a: { type: "string" }, run_b: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_orchestrate", description: "Skein task-graph: graph/claim/release/status/log with evidence gate", inputSchema: { type: "object", properties: { op: { type: "string" }, node: { type: "string" }, agent_id: { type: "string" } } }, annotations: { readOnly: false, idempotent: true } },
  { name: "ape_evolve", description: "ADAM evolution lifecycle: propose (auto-signals) -> EVE measure -> governed accept/reject (destructive: confirm)", inputSchema: { type: "object", properties: { proposal_id: { type: "string" }, action: { type: "string" }, kind: { type: "string" }, topic: { type: "string" }, organism_id: { type: "string" } } }, annotations: { readOnly: false, destructive: true, idempotent: false } },
  { name: "ape_report", description: "Fetch report artifacts (EVE run reports, genesis ledger, genesis report render)", inputSchema: { type: "object", properties: { ref: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_task_start", description: "Start any APE tool as a background task (Tasks extension); poll with ape_task_get", inputSchema: { type: "object", properties: { tool: { type: "string" }, arguments: { type: "object" } }, required: ["tool"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_task_get", description: "Poll a background task (running/done/failed + result)", inputSchema: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_profiles", description: "List available agent profiles + their declared tools and limits", inputSchema: { type: "object", properties: { } }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_run", description: "Invoke an agent profile against an objective; returns run_id immediately (poll ape_agent_status). provider/model override auto-detection", inputSchema: { type: "object", properties: { profile: { type: "string" }, objective: { type: "string" }, organism_id: { type: "string" }, provider: { type: "string" }, model: { type: "string" } }, required: ["profile", "objective"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_agent_status", description: "Poll an agent run: status, steps, cost, outcome", inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "ape_agent_cancel", description: "Cancel a running agent run, preserving the partial ledger", inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_connector_call", description: "Call a user-defined connector operation (egress-allowlisted). destructive ops need confirm", inputSchema: { type: "object", properties: { connector: { type: "string" }, operation: { type: "string" }, input: { type: "object" }, confirm: { type: "boolean" } }, required: ["connector", "operation"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "ape_connector_list", description: "List loaded connectors + their operations and egress hosts", inputSchema: { type: "object", properties: { } }, annotations: { readOnly: true, idempotent: true } },
];

export async function dispatchCall(name, args = {}, ctx = {}) {
  const t0 = Date.now();
  const traceId = ctx.traceId || newTraceId();
  const mods = await loadMods(root);
  // MCP hosts may deliver `arguments` as a JSON string (e.g. opencode) or an object.
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
        result = {
          ...base,
          active_provider: safeActive,
          detected_providers: await detectProviders(),
        };
        break;
      }
      case "ape_remember": result = await adamCall("adam_memory_store", { kind: a.kind || "episodic", content: a.content, origin: a.origin || "observation", confidence: a.confidence ?? 0.9 }, a.organism_id); break;
      case "ape_recall": result = await adamCall("adam_memory_query", { query: a.query, kind: a.kind, top_k: a.top_k ?? 5 }, a.organism_id); break;
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
        if (a.ref && existsSync(a.ref)) {
          const e = genesisEntry();
          result = e ? await runNode(e, ["report", a.ref]) : engineFail("genesis", "dist not built; run npm run build in vendors/genesis");
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
        result = { profiles: listProfiles().map((n) => ({ ...describeProfile(n), description: describeProfile(n)?.description })) };
        break;
      }
      case "ape_agent_run": {
        const profile = loadProfile(a.profile);
        if (!profile) { result = { error: "profile_not_found", profile: a.profile, available: listProfiles() }; break; }
        const runId = createRun({ profile: a.profile, model: profile.model.id, objective: a.objective, organism_id: a.organism_id ?? "default" });
        const worker = fork(join(root, "src", "agent", "worker.js"), [runId, JSON.stringify({ mockScript: a._mockScript, mockCostPerCall: a._mockCostPerCall, provider: a.provider, model: a.model })], { stdio: ["ignore", "ignore", "inherit", "ipc"], detached: true, execArgv: [] });
        worker.unref();
        updateRun(runId, { worker_pid: worker.pid });
        worker.on("exit", () => runningAgents.delete(runId));
        runningAgents.set(runId, worker);
        result = { run_id: runId, status: "running", profile: a.profile, poll: "ape_agent_status" };
        break;
      }
      case "ape_agent_status": result = getRun(a.run_id); break;
      case "ape_agent_cancel": {
        const run = getRun(a.run_id);
        const w = runningAgents.get(a.run_id);
        if (w) { try { w.kill(); } catch { /* already gone */ } runningAgents.delete(a.run_id); }
        else if (run.status === "running" && run.worker_pid) { try { process.kill(run.worker_pid); } catch { /* already gone */ } }
        if (run.status === "running") {
          updateRun(a.run_id, { status: "stopped", stop_reason: "cancelled", finished_at: new Date().toISOString() });
          result = { run_id: a.run_id, status: "stopped", stop_reason: "cancelled" };
        } else {
          result = { run_id: a.run_id, status: run.status, stop_reason: run.stop_reason, note: "run already finished" };
        }
        break;
      }
      case "ape_connector_list": {
        result = { connectors: connectorList().map((c) => ({ name: c.name, source: c.source, egress_allow: c.egress_allow, operations: c.operations.map((o) => ({ name: o.name, method: o.method, path: o.path, annotations: o.annotations })) })) };
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
        result = await (await import("./connectors.js")).runConnectorOperation(conn, op, a.input ?? {}, ctx);
        break;
      }
      default: result = { error: "unknown_tool", name };
    }
  } catch (e) {
    result = { error: "handler_failed", message: String(e).slice(0, 300) };
  }
  for (const m of mods) { try { if (m.hooks?.postCall) result = (await m.hooks.postCall(name, a, result, ctx)) ?? result; } catch { /* mods never break core */ } }
  const out = {
    resultType: "complete", traceId,
    content: [{ type: "text", text: JSON.stringify(result).slice(0, 4000) }],
    structuredContent: { tool: name, ok: !result?.error, result },
  };
  emitTrace({ traceId, tool: name, argsHash: shaShort(JSON.stringify(args)), handles: a.organism_id ?? a.node ?? "", durationMs: Date.now() - t0, resultSummary: JSON.stringify(result).slice(0, 200), modApplied: mods.map((m) => m.name).join(",") });
  return out;
}

export function toolsList() {
  return { protocol: PROTOCOL, tools: [...TOOL_DEFS].sort((a, b) => a.name.localeCompare(b.name)), ttlMs: 60000, cacheScope: "public" };
}
export function discover() {
  return {
    protocol: PROTOCOL,
    server: { name: "ape-mcp", version: "1.0.0" },
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
      return { profiles: listProfiles().map((n) => describeProfile(n)) };
    case "agent/describeProfile":
      return describeProfile(params.profile) ?? { error: "profile_not_found", profile: params.profile, available: listProfiles() };
    case "agent/run": {
      const profile = loadProfile(params.profile);
      if (!profile) return { error: "profile_not_found", profile: params.profile, available: listProfiles() };
      const runId = createRun({ profile: params.profile, model: profile.model.id, objective: params.objective, organism_id: params.organism_id ?? "default" });
      const worker = fork(join(root, "src", "agent", "worker.js"), [runId, JSON.stringify({ mockScript: params._mockScript, mockCostPerCall: params._mockCostPerCall, provider: params.provider, model: params.model })], { stdio: ["ignore", "ignore", "inherit", "ipc"], detached: true, execArgv: [] });
      worker.unref();
      updateRun(runId, { worker_pid: worker.pid });
      worker.on("exit", () => runningAgents.delete(runId));
      runningAgents.set(runId, worker);
      return { run_id: runId, status: "running", profile: params.profile };
    }
    case "agent/getRun":
      return getRun(params.run_id);
    case "agent/cancel": {
      const run = getRun(params.run_id);
      const w = runningAgents.get(params.run_id);
      if (w) { try { w.kill(); } catch { /* already gone */ } runningAgents.delete(params.run_id); }
      else if (run.status === "running" && run.worker_pid) { try { process.kill(run.worker_pid); } catch { /* already gone */ } }
      if (run.status === "running") {
        updateRun(params.run_id, { status: "stopped", stop_reason: "cancelled", finished_at: new Date().toISOString() });
        return { run_id: params.run_id, status: "stopped", stop_reason: "cancelled" };
      }
      return { run_id: params.run_id, status: run.status, stop_reason: run.stop_reason, note: "run already finished" };
    }
    default:
      return { error: "unknown_method", method };
  }
}