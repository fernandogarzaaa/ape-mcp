import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatch } from "./dispatch.js";
import { emitTrace, newTraceId, shaShort, dataDir, tracePath } from "./trace.js";
import { loadMods } from "./mods.js";
import { taskCreate, taskGet, taskList, taskFinish } from "./tasks.js";
import { adamCall } from "./adam-client.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROTOCOL = "2026-07-28";

export const TOOL_DEFS = [
  { name: "godmode_status", description: "GodMode status: versions, vendored engines, mods", inputSchema: { type: "object", properties: { organism_id: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_remember", description: "Store durable memory in ADAM organism (real stdio call to vendored adam-mcp)", inputSchema: { type: "object", properties: { kind: { type: "string" }, content: { type: "string" }, origin: { type: "string" }, confidence: { type: "number" }, organism_id: { type: "string" } }, required: ["content"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "godmode_recall", description: "Query ADAM memory + prior decisions (real stdio call to vendored adam-mcp)", inputSchema: { type: "object", properties: { query: { type: "string" }, kind: { type: "string" }, top_k: { type: "number" }, organism_id: { type: "string" } }, required: ["query"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_beliefs", description: "List ADAM beliefs or form one from evidence (real stdio call; statement form creates a new belief)", inputSchema: { type: "object", properties: { statement: { type: "string" }, origin: { type: "string" }, organism_id: { type: "string" } } }, annotations: { readOnly: false, idempotent: false } },
  { name: "godmode_genome", description: "Current ADAM genome payload (values, goals, capabilities, policies)", inputSchema: { type: "object", properties: { organism_id: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_mcp_eval", description: "EVE mcp-eval: schema, conformance + fuzz oracles against an MCP server target", inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_validate_experience", description: "Run EVE human-loop simulation (personas, seeded, evidence-backed)", inputSchema: { type: "object", properties: { url: { type: "string" }, persona: { type: "string" }, goal: { type: "string" }, seed: { type: "number" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_audit_claim", description: "Genesis: evaluate claim + adversarially audit verifier (SOUND/EXPLOITABLE)", inputSchema: { type: "object", properties: { suite: { type: "string" }, verifier: { type: "string" }, spec: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_compare", description: "Genesis compare/regression between two runs", inputSchema: { type: "object", properties: { run_a: { type: "string" }, run_b: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_orchestrate", description: "Skein task-graph: graph/claim/release/status/log with evidence gate", inputSchema: { type: "object", properties: { op: { type: "string" }, node: { type: "string" }, agent_id: { type: "string" } } }, annotations: { readOnly: false, idempotent: true } },
  { name: "godmode_world_simulate", description: "EVE-MIRO closed loop: WorldState->sim->EVE->ledger (provenance-labeled)", inputSchema: { type: "object", properties: { scenario: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_evolve", description: "ADAM propose->EVE measure->governed accept/reject (destructive: confirm)", inputSchema: { type: "object", properties: { proposal_id: { type: "string" }, action: { type: "string" }, organism_id: { type: "string" } } }, annotations: { readOnly: false, destructive: true, idempotent: false } },
  { name: "godmode_report", description: "Fetch latest EVE/Genesis/MIRO report pointers", inputSchema: { type: "object", properties: { ref: { type: "string" } } }, annotations: { readOnly: true, idempotent: true } },
  { name: "godmode_task_start", description: "Start any GodMode tool as a background task (Tasks extension); poll with godmode_task_get", inputSchema: { type: "object", properties: { tool: { type: "string" }, arguments: { type: "object" } }, required: ["tool"] }, annotations: { readOnly: false, idempotent: false } },
  { name: "godmode_task_get", description: "Poll a background task (running/done/failed + result)", inputSchema: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"] }, annotations: { readOnly: true, idempotent: true } },
];

export async function dispatchCall(name, args = {}, ctx = {}) {
  const t0 = Date.now();
  const traceId = ctx.traceId || newTraceId();
  const mods = loadMods(root);
  let a = { ...args };
  for (const m of mods) { try { if (m.hooks?.preCall) a = (await m.hooks.preCall(name, a, ctx)) ?? a; } catch (e) { emitTrace({ traceId, tool: name, modApplied: m.name + ":preCall-error" }); } }
  // MRTR-style confirm for destructive evolve without explicit confirm
  if (name === "godmode_evolve" && (a.action === "accept" || a.action === "apply") && a.confirm !== true && !ctx.headlessBypass) {
    const dur = Date.now() - t0;
    emitTrace({ traceId, tool: name, argsHash: shaShort(JSON.stringify(a)), durationMs: dur, resultSummary: "input_required:confirm" });
    return { resultType: "input_required", traceId, inputRequests: [{ id: "confirm-evolve", type: "elicitation", message: "Accepting a genome mutation is destructive. Confirm?", schema: { confirm: "boolean" } }], requestState: shaShort(traceId + name) };
  }
  let result;
  try {
    switch (name) {
      case "godmode_status": result = dispatch.status(a); break;
      case "godmode_remember": result = await adamCall("adam_memory_store", { kind: a.kind || "episodic", content: a.content, origin: a.origin || "observation", confidence: a.confidence ?? 0.9 }, a.organism_id); break;
      case "godmode_recall": result = await adamCall("adam_memory_query", { query: a.query, kind: a.kind, top_k: a.top_k ?? 5 }, a.organism_id); break;
      case "godmode_beliefs": result = await adamCall("adam_beliefs", a.statement ? { statement: a.statement, origin: a.origin || "observation" } : {}, a.organism_id); break;
      case "godmode_genome": result = await adamCall("adam_genome", {}, a.organism_id); break;
      case "godmode_mcp_eval": {
        const e = dispatch.eveEntry();
        result = e ? dispatch.runNode(e, ["mcp-eval", a.target]) : dispatch.failEve();
        break;
      }
      case "godmode_validate_experience": result = dispatch.validate_experience(a); break;
      case "godmode_audit_claim": result = dispatch.audit_claim(a); break;
      case "godmode_compare": result = { runs: [a.run_a, a.run_b], note: "use vendors/genesis compare; see schemas/godmode-map.yaml" }; break;
      case "godmode_orchestrate": result = dispatch.orchestrate(a); break;
      case "godmode_world_simulate": result = dispatch.world(a); break;
      case "godmode_evolve": result = { proposal: a.proposal_id, action: a.action, governance: "values/goals/capabilities/policies need EVE approve; preferences.* ungated", organism_id: a.organism_id }; break;
      case "godmode_report": result = { ref: a.ref ?? "latest", pointers: ["report://eve/{id}", "ledger://genesis", "world://t0"] }; break;
      case "godmode_task_start": {
        const inner = a.tool;
        if (!TOOL_DEFS.find((t) => t.name === inner) || inner === "godmode_task_start") { result = { error: "unknown_tool", name: inner }; break; }
        const id = taskCreate(inner, a.arguments ?? {});
        setImmediate(async () => {
          try {
            const r = await dispatchCall(inner, a.arguments ?? {}, { ...ctx, viaTask: id });
            taskFinish(id, r);
          } catch (e) { taskFinish(id, null, String(e).slice(0, 300)); }
        });
        result = { task_id: id, status: "running", poll: "godmode_task_get" };
        break;
      }
      case "godmode_task_get": result = taskGet(a.task_id); break;
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
  return { protocol: PROTOCOL, server: { name: "godmode", version: "1.0.0" }, capabilities: { tools: {}, resources: {}, prompts: {}, extensions: { "io.modelcontextprotocol/tasks": {} } } };
}
