import test from "node:test";
import assert from "node:assert";
import { loadProfile, listProfiles } from "../src/agent/profiles.js";
import { runAgent } from "../src/agent/loop.js";
import { makeBudget } from "../src/agent/budget.js";
import { dispatchCall } from "../src/server.js";

const baseProfile = {
  name: "gate-profile",
  model: { provider: "mock", id: "mock-model" },
  system: "Be careful. Verify before claiming.",
  tools: [
    { engine: "skein.orchestrate" },
    { engine: "genesis.audit_claim" },
    { builtin: "memory.recall" },
    { builtin: "memory.store" },
    { builtin: "finish" },
  ],
  limits: { max_steps: 20, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0 },
  stop_conditions: ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"],
};

test("agent: multi-step run with 2+ engine tools, full step ledger, enforced budget", async () => {
  const script = [
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "genesis.audit_claim", args: {} },
    { tool: "memory.recall", args: { query: "prior decisions" } },
    { tool: "memory.store", args: { content: "gate run outcome" } },
    { tool: "finish", args: { summary: "triage complete" } },
  ];
  const steps = [];
  const res = await runAgent({
    profile: baseProfile,
    objective: "Triage the reported issue.",
    onStep: (s) => steps.push(s),
    mockScript: script,
  });
  assert.equal(res.stop_reason, "explicit_final_answer");
  assert.equal(res.outcome, "triage complete");
  assert.ok(res.step_count >= 5, "at least 5 model+tool steps");
  const toolNames = steps.filter((s) => s.kind === "tool").map((s) => s.tool);
  assert.ok(toolNames.includes("skein.orchestrate"), "engine tool 1 invoked");
  assert.ok(toolNames.includes("genesis.audit_claim"), "engine tool 2 invoked");
  assert.ok(toolNames.includes("memory.recall") && toolNames.includes("memory.store"), "memory builtins invoked");
  assert.ok(res.total_cost >= 0 && res.total_tokens >= 0, "cost/tokens tracked");
  assert.ok(res.duration_ms >= 0, "duration tracked");
});

test("agent: deliberately looping profile halted by max_steps", async () => {
  const loopScript = Array.from({ length: 50 }, (_, i) => ({ tool: "memory.recall", args: { query: "loop-" + i } }));
  const res = await runAgent({
    profile: { ...baseProfile, limits: { max_steps: 3, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0 } },
    objective: "loop forever",
    mockScript: loopScript,
  });
  assert.equal(res.stop_reason, "max_steps");
  assert.equal(res.step_count, 3);
});

test("agent: deliberately looping profile halted by max_usd", async () => {
  const loopScript = Array.from({ length: 50 }, () => ({ tool: "memory.recall", args: { query: "x" } }));
  const res = await runAgent({
    profile: { ...baseProfile, limits: { max_steps: 50, max_tokens: 100000, max_wall_seconds: 60, max_usd: 0.002 } },
    objective: "burn budget",
    mockScript: loopScript,
    mockCostPerCall: 0.001,
  });
  assert.equal(res.stop_reason, "max_usd");
  assert.ok(res.total_cost >= 0.002, "cost ceiling respected");
});

test("agent: budget governor halts on each limit independently", () => {
  const b = makeBudget({ max_steps: 2, max_tokens: 1000, max_wall_seconds: 60, max_usd: 0.5 });
  b.steps = 2;
  assert.equal(b.check().reason, "max_steps");
  const b2 = makeBudget({ max_steps: 100, max_tokens: 1000, max_wall_seconds: 60, max_usd: 0.5 });
  b2.spend({ tokens: 1500 });
  assert.equal(b2.check().reason, "max_tokens");
  const b3 = makeBudget({ max_steps: 100, max_tokens: 1000, max_wall_seconds: 60, max_usd: 0.5 });
  b3.spend({ cost: 0.7 });
  assert.equal(b3.check().reason, "max_usd");
});

test("agent: persistent ADAM session — 2 memory calls in one run use <=1 spawn", async () => {
  const { adamSpawnCount } = await import("../src/adam-client.js");
  const before = adamSpawnCount();
  const script = [
    { tool: "memory.recall", args: { query: "prior" } },
    { tool: "memory.store", args: { content: "spawn-gate" } },
    { tool: "finish", args: { summary: "done" } },
  ];
  await runAgent({ profile: baseProfile, objective: "check spawns", mockScript: script });
  assert.ok(adamSpawnCount() - before <= 1, `spawn delta <= 1 (was ${adamSpawnCount() - before})`);
});

test("agent: MCP integration — ape_agent_run returns run_id, run completes with ledger steps", async () => {
  const script = [
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "finish", args: { summary: "integrated" } },
  ];
  const r = await dispatchCall("ape_agent_run", {
    profile: "repo-triage",
    objective: "Integration gate.",
    _mockScript: script,
  }, { headlessBypass: true });
  assert.equal(r.resultType, "complete");
  const runId = r.structuredContent.result.run_id;
  assert.ok(runId);
  let st = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 250));
    const g = await dispatchCall("ape_agent_status", { run_id: runId });
    st = g.structuredContent.result;
    if (st.status === "done" || st.status === "failed") break;
  }
  assert.equal(st.status, "done", "run reaches done (status=" + st.status + " reason=" + st.stop_reason + ")");
  assert.ok(st.steps.length >= 2, "step ledger populated");
  assert.ok(st.total_cost >= 0 && st.step_count >= 2, "ledger has cost + count");
});

test("agent: profiles load bundled defaults + list works", () => {
  const p = loadProfile("repo-triage");
  assert.ok(p, "repo-triage bundled profile loads");
  assert.equal(p.model.provider, "anthropic");
  assert.ok(loadProfile("persona-validate"));
  assert.ok(listProfiles().includes("repo-triage"));
});