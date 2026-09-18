// Internal tool registry — what an agent may call inside its reasoning loop.
// Maps profile tool entries (engine:/builtin:/connector:) to implementations.
import { dispatchCall, TOOL_DEFS } from "../server.js";
import { adamCall } from "../adam-client.js";
import { connectorList } from "../connectors.js";

export function internalTools(profile) {
  const tools = [];
  for (const entry of profile.tools ?? []) {
    if (entry.engine) {
      const apeName = "ape_" + entry.engine.split(".").slice(1).join("_");
      const def = TOOL_DEFS.find((t) => t.name === apeName);
      if (def) tools.push({ name: entry.engine, description: def.description, inputSchema: def.inputSchema, kind: "engine", apeName });
    } else if (entry.builtin) {
      if (entry.builtin === "memory.recall") {
        tools.push({ name: "memory.recall", description: "Query ADAM durable memory (prior decisions, past runs).", inputSchema: { type: "object", properties: { query: { type: "string" }, kind: { type: "string" }, top_k: { type: "number" } }, required: ["query"] }, kind: "memory", op: "query" });
      } else if (entry.builtin === "memory.store") {
        tools.push({ name: "memory.store", description: "Store a durable memory in ADAM.", inputSchema: { type: "object", properties: { kind: { type: "string" }, content: { type: "string" }, origin: { type: "string" }, confidence: { type: "number" } }, required: ["content"] }, kind: "memory", op: "store" });
      } else if (entry.builtin === "finish") {
        tools.push({ name: "finish", description: "Call this with your final answer summary when the task is complete.", inputSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] }, kind: "finish" });
      }
    } else if (entry.connector) {
      tools.push({ name: entry.connector, description: `User-defined connector ${entry.connector} (operations listed at call time).`, inputSchema: { type: "object", properties: { operation: { type: "string" }, input: { type: "object" } }, required: ["operation"] }, kind: "connector", connector: entry.connector });
    }
  }
  return tools;
}

export async function invokeTool(tool, args, ctx) {
  if (tool.kind === "engine") {
    return (await dispatchCall(tool.apeName, args ?? {}, { ...ctx, headlessBypass: true })).structuredContent.result;
  }
  if (tool.kind === "memory") {
    return tool.op === "store"
      ? await adamCall("adam_memory_store", args ?? {}, ctx.organism_id)
      : await adamCall("adam_memory_query", args ?? {}, ctx.organism_id);
  }
  if (tool.kind === "finish") {
    return { done: true, summary: args?.summary ?? "" };
  }
  if (tool.kind === "connector") {
    const conn = connectorList().find((c) => c.name === tool.connector);
    if (!conn) return { error: "engine_not_configured", engine: "connector:" + tool.connector, hint: "connector not authored; see .ape/connectors/<name>.yaml" };
    const op = conn.operations.find((o) => o.name === args?.operation);
    if (!op) return { error: "connector_unknown_operation", connector: tool.connector, operations: conn.operations.map((o) => o.name) };
    return (await import("../connectors.js")).runConnectorOperation(conn, op, args?.input ?? {});
  }
  return { error: "unknown_tool", name: tool.name };
}