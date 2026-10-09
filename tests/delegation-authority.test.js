// M1+M2: delegation is a security boundary.
// Authority: effective_child_authority ⊆ effective_parent_authority through
// any nesting depth (deny cascades, allow never regains).
// Budget: child consumption debits the parent (tokens+USD); slices never
// exceed remaining; wall-clock survives resume.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-delegate-sec-"));
process.env.APE_ALLOW_MOCK_INPUT = "1";

const { sliceChildBudget, intersectRestrictions, effectiveDestructivePolicy } = await import("../src/agent/registry.js");
const { runAgent } = await import("../src/agent/loop.js");
const runs = await import("../src/runs.js");

const CHILD_ALLOW = `name: del-sec-child
description: hermetic allow-profile child
model: { provider: mock, id: mock-model }
system: test child
policy: { destructive: allow }
tools:
  - engine: adam.evolve
  - builtin: finish
limits: { max_steps: 5, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0, max_destructive: 1 }
`;
function writeProfiles() {
  const dir = join(process.env.APE_DATA_DIR, "profiles");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "del-sec-child.yaml"), CHILD_ALLOW);
}
const parentProfile = () => ({
  name: "del-sec-parent",
  model: { provider: "mock", id: "mock-model" },
  system: "test parent",
  tools: [{ builtin: "delegate" }, { builtin: "finish" }],
  limits: { max_steps: 10, max_tokens: 100000, max_wall_seconds: 120, max_usd: 1.0, max_delegate_depth: 2 },
  policy: { destructive: "deny", verify_before_finish: "off" },
  stop_conditions: ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"],
});
const EVOLVE_ACCEPT = { tool: "adam.evolve", args: { action: "accept", proposal_id: "nope-missing" } };

test("M1: restriction lattice — deny wins at every level, allow never regains", () => {
  assert.equal(effectiveDestructivePolicy(undefined, null), "deny", "default deny");
  assert.equal(effectiveDestructivePolicy("allow", null), "allow", "explicit allow holds alone");
  assert.equal(effectiveDestructivePolicy("allow", { destructive: "deny" }), "deny", "inherited deny overrides allow");
  assert.equal(effectiveDestructivePolicy("deny", { destructive: "allow" }), "deny", "own deny holds");
  assert.deepEqual(intersectRestrictions({ destructive: "deny" }, { destructive: "allow" }), { destructive: "deny" });
  assert.deepEqual(intersectRestrictions(null, { destructive: "allow" }), { destructive: "allow" });
  // Nesting: parent deny -> child allow -> grandchild allow stays denied.
  const l1 = intersectRestrictions({ destructive: "deny" }, { destructive: "allow" });
  const l2 = intersectRestrictions(l1, { destructive: "allow" });
  assert.equal(effectiveDestructivePolicy("allow", l2), "deny", "deny survives two delegation levels");
});

test("M1: inherited deny blocks a destructive call the child profile allows", async () => {
  writeProfiles();
  const res = await runAgent({
    profile: {
      name: "del-sec-child", model: { provider: "mock", id: "mock-model" }, system: "t",
      tools: [{ engine: "adam.evolve" }, { builtin: "finish" }],
      limits: { max_steps: 5, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0, max_destructive: 1 },
      policy: { destructive: "allow" },
      stop_conditions: ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"],
    },
    objective: "attempt the forbidden call",
    inheritedRestrictions: { destructive: "deny" },
    mockScript: [EVOLVE_ACCEPT, { tool: "finish", args: { summary: "done" } }],
  });
  const step = res.steps.find((s) => s.tool === "adam.evolve");
  assert.ok(step, "destructive attempt recorded");
  assert.ok(String(step.resultSummary).includes("destructive:denied"), `denied in ledger, got: ${String(step.resultSummary).slice(0, 120)}`);
  assert.equal(res.receipt.destructive_used, 0, "nothing executed against the cap");
});

test("M1: without inherited deny, allow still reaches dispatch (control)", async () => {
  const res = await runAgent({
    profile: {
      name: "del-sec-child", model: { provider: "mock", id: "mock-model" }, system: "t",
      tools: [{ engine: "adam.evolve" }, { builtin: "finish" }],
      limits: { max_steps: 5, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0, max_destructive: 1 },
      policy: { destructive: "allow" },
      stop_conditions: ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"],
    },
    objective: "attempt the call",
    mockScript: [EVOLVE_ACCEPT, { tool: "finish", args: { summary: "done" } }],
  });
  const step = res.steps.find((s) => s.tool === "adam.evolve");
  assert.ok(step, "attempt recorded");
  // Reached the real engine (proposal_not_found / engine error), NOT the loop deny gate.
  assert.ok(!String(step.resultSummary).includes("destructive:denied"), "allow path not denied");
  assert.ok(/proposal_not_found|no_proposal|adam|error|unavailable/i.test(String(step.resultSummary)), `dispatch reached engine, got: ${String(step.resultSummary).slice(0, 160)}`);
});

test("M1: delegation forwards the parent deny into the child row", async () => {
  writeProfiles();
  const res = await runAgent({
    profile: parentProfile(),
    objective: "supervise",
    mockScript: [
      { tool: "delegate", args: { profile: "del-sec-child", objective: "subtask" } },
      { tool: "finish", args: { summary: "synthesized" } },
    ],
    parentRunId: "run-sec-parent",
  });
  assert.equal(res.stop_reason, "explicit_final_answer");
  const d = res.receipt.delegations[0];
  assert.ok(d?.run_id, "child ran");
  const child = runs.getRun(d.run_id);
  assert.notEqual(child.status, "running", "child terminal");
  const inherited = JSON.parse(child.inherited_policy ?? "null");
  assert.deepEqual(inherited, { destructive: "deny" }, "parent deny recorded on child row");
});

test("M2: slice refuses exhausted dimensions, never floors above remaining", () => {
  const full = { stepsLeft: 10, tokensLeft: 10000, usdLeft: 1.0, wallMsLeft: 300000 };
  assert.equal(sliceChildBudget(full, 0.5).limits.max_steps, 5);
  assert.ok(sliceChildBudget({ ...full, stepsLeft: 0 }).error, "no steps left refuses");
  assert.ok(sliceChildBudget({ ...full, usdLeft: 0 }).error, "no USD left refuses");
  assert.ok(sliceChildBudget({ ...full, tokensLeft: 0 }).error, "no tokens left refuses");
  assert.ok(sliceChildBudget({ ...full, wallMsLeft: 0 }).error, "no wall left refuses");
  // Near-exhausted: slice stays at or under remaining, never a fresh floor.
  const thin = sliceChildBudget({ stepsLeft: 5, tokensLeft: 2, usdLeft: 0.0004, wallMsLeft: 30000 }, 0.25);
  assert.ok(!thin.error);
  assert.ok(thin.limits.max_usd <= 0.0004, `usd slice ${thin.limits.max_usd} within remaining`);
  assert.ok(thin.limits.max_tokens <= 2, "token slice within remaining");
  assert.ok(thin.limits.max_steps <= 5, "step slice within remaining");
  assert.ok(thin.limits.max_wall_seconds * 1000 <= 30000, `wall slice ${thin.limits.max_wall_seconds}s within remaining`);
  // Unlimited dimensions delegate freely.
  const unlim = sliceChildBudget({ stepsLeft: 5, tokensLeft: null, usdLeft: null, wallMsLeft: null }, 0.25);
  assert.ok(!unlim.error);
  assert.equal(unlim.limits.max_tokens, null, "unlimited tokens stay unlimited");
  assert.equal(unlim.limits.max_usd, null, "unlimited USD stays unlimited");
});

test("M2: sub-second wall remainder refuses instead of granting a floor above it", () => {
  // The advisor's edge: 200ms remaining at share 0.5 used to grant a full
  // 1s floor. Now delegation is refused: a child cannot usefully run in it.
  for (const ms of [200, 999, 4999]) {
    const r = sliceChildBudget({ stepsLeft: 10, tokensLeft: 10000, usdLeft: 1.0, wallMsLeft: ms }, 0.5);
    assert.ok(r.error, `${ms}ms remaining refuses`);
    assert.match(r.detail ?? "", /minimum viable child grant/, "honest reason");
  }
  // At exactly the minimum, the grant is bounded by remaining, never above.
  const edge = sliceChildBudget({ stepsLeft: 10, tokensLeft: 10000, usdLeft: 1.0, wallMsLeft: 5000 }, 0.5);
  assert.ok(!edge.error);
  assert.ok(edge.limits.max_wall_seconds * 1000 <= 5000, `grant ${edge.limits.max_wall_seconds}s within remaining`);
});

test("M2: child token spend debits the parent ledger totals", async () => {
  writeProfiles();
  const res = await runAgent({
    profile: parentProfile(),
    objective: "supervise with accounting",
    mockScript: [
      { tool: "delegate", args: { profile: "del-sec-child", objective: "subtask" } },
      { tool: "finish", args: { summary: "synthesized" } },
    ],
    parentRunId: "run-sec-acct",
  });
  assert.equal(res.stop_reason, "explicit_final_answer");
  const dstep = res.steps.find((s) => s.tool === "delegate");
  assert.ok(dstep, "delegate step recorded");
  // Mock turns spend a fixed 2 tokens each: parent turns + debited child turn.
  // Child ran exactly 1 mock turn (2 tokens); parent total must include them.
  assert.ok(/debited:tokens=2/.test(String(dstep.resultSummary)), `debit annotated, got: ${String(dstep.resultSummary).slice(-80)}`);
  assert.ok(res.receipt.tokens >= 6, `parent tokens ${res.receipt.tokens} include the child turn`);
  assert.equal(dstep.tokens, 2, "delegate step carries child tokens so row totals stay honest");
});

test("M2: restored wall-clock does not grant a fresh window", async () => {
  const res = await runAgent({
    profile: {
      name: "del-sec-wall", model: { provider: "mock", id: "mock-model" }, system: "t",
      tools: [{ builtin: "finish" }],
      limits: { max_steps: 10, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0 },
      stop_conditions: ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"],
    },
    objective: "already out of time",
    initial: { budget: { steps: 0, tokens: 0, usd: 0, started: Date.now() - 120000 } },
    mockScript: [{ tool: "finish", args: { summary: "should never run" } }],
  });
  assert.equal(res.stop_reason, "max_wall_seconds", `expired wall halts before any turn, got: ${res.stop_reason}`);
  assert.equal(res.steps.length, 0, "no model turn executed on an expired budget");
});

test("M2: unlimited parent dimensions delegate freely (null stays unbounded)", async () => {
  writeProfiles();
  const res = await runAgent({
    profile: {
      name: "del-sec-unlim", model: { provider: "mock", id: "mock-model" }, system: "t",
      tools: [{ builtin: "delegate" }, { builtin: "finish" }],
      limits: { max_steps: 10, max_delegate_depth: 2 },
      policy: { destructive: "deny", verify_before_finish: "off" },
      stop_conditions: ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"],
    },
    objective: "supervise without ceilings",
    mockScript: [
      { tool: "delegate", args: { profile: "del-sec-child", objective: "subtask" } },
      { tool: "finish", args: { summary: "synthesized" } },
    ],
    parentRunId: "run-sec-unlim",
  });
  assert.equal(res.stop_reason, "explicit_final_answer", `unlimited parent completes: ${res.stop_reason}`);
  const d = res.receipt.delegations[0];
  assert.ok(d?.run_id, "child ran despite no finite ceilings");
  assert.equal(runs.getRun(d.run_id).status === "running", false, "child terminal");
});
