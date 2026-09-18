// The reasoning loop — the Tool Orchestrator pattern with a real model in the loop.
// The host sees one tool call (ape_agent_run); everything below is APE's implementation.
import { makeBudget } from "./budget.js";
import { chat, estimateCost, toolSchemas, mockPlan, clearMock } from "./providers.js";
import { internalTools, invokeTool } from "./registry.js";
import { shaShort } from "../trace.js";

export async function runAgent({ profile, objective, organism_id = "default", onStep, mockScript, mockCostPerCall = 0 }) {
  const budget = makeBudget(profile.limits);
  const tools = internalTools(profile);
  const schemas = toolSchemas(profile.model, tools);
  const system = profile.system ?? "You are a careful agent. Verify before claiming.";
  const messages = [{ role: "user", content: String(objective) }];
  const convKey = `run-${organism_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const providerCfgs = [profile.model, ...(profile.model.fallback ? [profile.model.fallback] : [])];

  const steps = [];
  const startedAt = Date.now();
  let stopReason = null;
  let outcome = null;
  let usedModel = profile.model.id;
  const record = (step) => { steps.push(step); onStep?.(step); };

  if (profile.model.provider === "mock") mockPlan(convKey, mockScript ?? [], mockCostPerCall);

  try {
    while (true) {
      const pre = budget.check();
      if (pre.exhausted) { stopReason = pre.reason; break; }

      // Model call with provider fallback chain.
      let resp = null;
      let lastErr = null;
      for (const p of providerCfgs) {
        try {
          resp = await chat({ provider: p.provider, id: p.id, convKey }, { system, messages, tools: schemas });
          usedModel = p.id;
          break;
        } catch (e) { lastErr = e; }
      }
      if (!resp) {
        stopReason = "model_error";
        outcome = { error: String(lastErr?.message ?? lastErr ?? "model call failed").slice(0, 400) };
        record({ step: budget.steps + 1, kind: "model", tool: null, durationMs: 0, tokens: 0, cost: 0, resultSummary: outcome.error });
        break;
      }

      budget.steps++;
      const tokens = resp.usage.inputTokens + resp.usage.outputTokens;
      const cost = resp.mockCost ?? estimateCost(usedModel, resp.usage);
      budget.spend({ tokens, cost });
      record({ step: budget.steps, kind: "model", tool: null, durationMs: 0, tokens, cost, resultSummary: (resp.content ?? "").slice(0, 200) });

      const toolCalls = resp.toolCalls ?? [];
      // Explicit finish tool = terminal.
      const finishCall = toolCalls.find((tc) => tc.name === "finish");
      if (finishCall) {
        for (const tc of toolCalls) {
          record({ step: budget.steps, kind: "tool", tool: tc.name, argsHash: shaShort(JSON.stringify(tc.args)), durationMs: 0, tokens: 0, cost: 0, resultSummary: "terminal" });
          messages.push({ role: "assistant", content: resp.content ?? "", toolCalls: [tc] });
          if (tc === finishCall) messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify({ done: true }) });
        }
        stopReason = "explicit_final_answer";
        outcome = finishCall.args?.summary ?? resp.content ?? "";
        break;
      }
      // No tool call at all.
      if (!toolCalls.length) {
        if (profile.stop_conditions.includes("no_tool_call_in_step")) {
          stopReason = "no_tool_call_in_step";
          outcome = resp.content ?? "";
          break;
        }
        stopReason = "no_tool_call_in_step";
        outcome = resp.content ?? "";
        break;
      }

      messages.push({ role: "assistant", content: resp.content ?? "", toolCalls });
      for (const tc of toolCalls) {
        const tool = tools.find((t) => t.name === tc.name);
        let res;
        if (!tool) {
          res = { error: "unknown_tool", name: tc.name };
        } else {
          const t0 = Date.now();
          try { res = await invokeTool(tool, tc.args ?? {}, { organism_id }); }
          catch (e) { res = { error: "handler_failed", message: String(e).slice(0, 200) }; }
          const dur = Date.now() - t0;
          record({ step: budget.steps, kind: "tool", tool: tc.name, argsHash: shaShort(JSON.stringify(tc.args)), durationMs: dur, tokens: 0, cost: 0, resultSummary: JSON.stringify(res).slice(0, 200) });
        }
        messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify(res).slice(0, 8000) });
        const post = budget.check();
        if (post.exhausted) { stopReason = post.reason; break; }
      }
      if (stopReason) break;
    }
  } finally {
    if (profile.model.provider === "mock") clearMock(convKey);
  }

  return {
    profile: profile.name,
    model: usedModel,
    stop_reason: stopReason,
    outcome,
    step_count: budget.steps,
    total_tokens: budget.tokens,
    total_cost: budget.usd,
    duration_ms: Date.now() - startedAt,
    steps,
  };
}