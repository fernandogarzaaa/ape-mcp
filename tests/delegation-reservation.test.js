import test from "node:test";
import assert from "node:assert/strict";
// Atomic budget reservation: concurrent children cannot be granted overlapping
// slices of the same remaining budget (escrow at spawn, settle at completion),
// nested escrow composes, and every exit path settles (completion, timeout,
// refusal). Failing any of these reopens double-spend of the parent ceiling.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-reserve-"));
process.env.APE_ALLOW_MOCK_INPUT = "1";
process.env.APE_MAX_CONCURRENT_RUNS = "32";
process.env.APE_MAX_DAILY_USD = "1000000";

const { runDelegated } = await import("../src/agent/registry.js");
const { runAgent } = await import("../src/agent/loop.js");
const { makeBudget } = await import("../src/agent/budget.js");
const runs = await import("../src/runs.js");

const CHILD = `name: del-rsv-child
description: hermetic reservation child (mock, finishes immediately)
model: { provider: mock, id: mock-model }
system: test child
tools:
  - builtin: finish
limits: { max_steps: 5, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0 }
`;
function writeChild() {
  const dir = join(process.env.APE_DATA_DIR, "profiles");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "del-rsv-child.yaml"), CHILD);
}
const parentProfile = (usd) => ({
  name: "del-rsv-parent",
  model: { provider: "mock", id: "mock-model" },
  system: "test parent",
  tools: [{ builtin: "delegate" }, { builtin: "finish" }],
  limits: { max_steps: 12, max_tokens: 100000, max_wall_seconds: 120, max_usd: usd, max_delegate_depth: 2 },
  policy: { verify_before_finish: "off" },
  stop_conditions: ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"],
});

test("reserve: parallel delegates observe each other's escrow (no overlap)", async () => {
  writeChild();
  // Parent ceiling $0.02, ~$0 spent: child1 (share .5) reserves $0.01, so
  // child2 in the SAME turn must slice from $0.01, not $0.02.
  const res = await runAgent({
    profile: parentProfile(0.02),
    objective: "two parallel subtasks",
    mockScript: [
      { calls: [
        { tool: "delegate", args: { profile: "del-rsv-child", objective: "one", budget_share: 0.5 } },
        { tool: "delegate", args: { profile: "del-rsv-child", objective: "two", budget_share: 0.5 } },
      ] },
      { tool: "finish", args: { summary: "synthesized" } },
    ],
    parentRunId: "run-rsv-par",
  });
  assert.equal(res.stop_reason, "explicit_final_answer", `parent completes: ${res.stop_reason}`);
  assert.equal(res.receipt.delegations.length, 2, "both children ran");
  const [d1, d2] = res.receipt.delegations;
  assert.ok(d1.reserved && d2.reserved, "grants recorded");
  assert.ok(d2.reserved.cost < d1.reserved.cost, `second grant shrunk by escrow: ${d1.reserved.cost} -> ${d2.reserved.cost}`);
  assert.ok(d1.reserved.cost + d2.reserved.cost <= 0.02 + 1e-9, `grants never overlap the ceiling: ${d1.reserved.cost}+${d2.reserved.cost}`);
  for (const d of [d1, d2]) {
    assert.ok(d.refunded != null, "every exit settles escrow");
    // Full-release semantics: the loop spends actuals separately, so the
    // refund returns the whole grant and reserved always nets to zero.
    assert.deepEqual(d.refunded, d.reserved, "escrow fully released, never netted");
  }
  // End-state honesty: receipt totals are actuals, no leaked escrow.
  assert.ok(res.receipt.cost_usd < 0.02, `no leaked reservation inflates totals: $${res.receipt.cost_usd}`);
});

test("reserve: escrow primitives compose across nesting levels", async () => {
  const { sliceChildBudget } = await import("../src/agent/registry.js");
  const parent = makeBudget({ max_steps: 20, max_tokens: 1000, max_usd: 1.0 });
  // Level 1: slice half for the child, reserve it.
  const s1 = sliceChildBudget({ stepsLeft: 20, tokensLeft: 1000, usdLeft: 1.0, wallMsLeft: null }, 0.5);
  assert.ok(!s1.error);
  parent.reserve({ steps: s1.limits.max_steps, tokens: s1.limits.max_tokens, cost: s1.limits.max_usd });
  // Level 2 (inside the child): the child sees only its slice remainder.
  const childRemaining = {
    stepsLeft: s1.limits.max_steps, tokensLeft: s1.limits.max_tokens,
    usdLeft: s1.limits.max_usd, wallMsLeft: null,
  };
  const s2 = sliceChildBudget(childRemaining, 0.5);
  assert.ok(!s2.error);
  assert.ok(s2.limits.max_usd <= s1.limits.max_usd, "grandchild slice within child slice");
  assert.ok(s2.limits.max_steps <= s1.limits.max_steps, "grandchild steps within child steps");
  // Parent ceiling still holds the whole chain: reserved + anything else.
  const check = parent.check();
  assert.ok(!check.exhausted, "reservation alone does not exhaust a healthy parent");
  // Child consumes part, refunds the rest: parent nets exactly consumption.
  parent.refund({ steps: s1.limits.max_steps - 3, tokens: s1.limits.max_tokens - 40, cost: s1.limits.max_usd - 0.1 });
  assert.equal(parent.tokens, 0, "tokens only move on spend, not escrow");
  parent.spend({ tokens: 40, cost: 0.1 });
  assert.equal(parent.tokens, 40);
  assert.equal(parent.usd, 0.1);
});

test("reserve: runDelegated settles escrow through a real fork", async () => {
  writeChild();
  const calls = [];
  const budget = makeBudget({ max_steps: 20, max_tokens: 100000, max_wall_seconds: 300, max_usd: 5 });
  const ctx = {
    organism_id: "default", depth: 0, parentRunId: "run-rsv-ctx", maxDelegateDepth: 2,
    restrictions: { destructive: "deny" },
    budget: { stepsLeft: 20, tokensLeft: 100000, usdLeft: 5, wallMsLeft: null },
    reserveBudget: (r) => { calls.push(["reserve", r]); budget.reserve(r); },
    refundBudget: (r) => { calls.push(["refund", r]); budget.refund(r); },
  };
  const out = await runDelegated({ profile: "del-rsv-child", objective: "escrow probe", budget_share: 0.5 }, ctx);
  assert.ok(out.delegated, `child completed: ${JSON.stringify(out).slice(0, 160)}`);
  const kinds = calls.map((c) => c[0]);
  assert.deepEqual(kinds, ["reserve", "refund"], "reserve precedes refund, exactly once each");
  assert.ok(calls[0][1].cost > 0, "reservation commits the granted slice");
  // Net parent effect equals the child's actual consumption (mock ~0 cost).
  assert.ok(budget.usd >= 0 && budget.usd < 0.001, `parent nets actuals: $${budget.usd}`);
  assert.ok(out.reserved && out.refunded, "grant + settlement visible on the receipt");
});

test("reserve: admission refusal moves no escrow", async () => {
  writeChild();
  const calls = [];
  const ctx = {
    organism_id: "default", depth: 0, parentRunId: null, maxDelegateDepth: 2,
    budget: { stepsLeft: 0, tokensLeft: 0, usdLeft: 0, wallMsLeft: null },
    reserveBudget: (r) => calls.push(["reserve", r]),
    refundBudget: (r) => calls.push(["refund", r]),
  };
  const out = await runDelegated({ profile: "del-rsv-child", objective: "x" }, ctx);
  assert.equal(out.error, "delegation_no_budget");
  assert.deepEqual(calls, [], "refused delegation reserves nothing");
});

test("reserve: timeout kills the child, debits partials, releases the rest", async () => {
  writeChild();
  const prevDelay = process.env.APE_MOCK_STEP_DELAY_MS;
  process.env.APE_MOCK_STEP_DELAY_MS = "6000";
  try {
    const res = await runAgent({
      profile: parentProfile(5),
      objective: "delegate to a hanging child",
      mockScript: [
        { tool: "delegate", args: { profile: "del-rsv-child", objective: "hang", timeout_s: 5 } },
        { tool: "finish", args: { summary: "parent survives timeout" } },
      ],
      parentRunId: "run-rsv-timeout",
    });
    const d = res.receipt.delegations.find((x) => x.error === "delegation_timeout");
    assert.ok(d, `timed-out delegation audited: ${JSON.stringify(res.receipt.delegations).slice(0, 200)}`);
    const child = runs.getRun(d.run_id);
    assert.equal(child.stop_reason, "delegation_timeout", `child timed out: ${child.stop_reason}`);
    assert.notEqual(child.status, "running", "timed-out child is not left running");
    assert.equal(res.stop_reason, "explicit_final_answer", "parent survives");
    // No leaked escrow: parent totals are own turns only (child recorded nothing).
    assert.ok(res.receipt.cost_usd < 0.001, `no leaked reservation: $${res.receipt.cost_usd}`);
  } finally {
    if (prevDelay === undefined) delete process.env.APE_MOCK_STEP_DELAY_MS;
    else process.env.APE_MOCK_STEP_DELAY_MS = prevDelay;
  }
}, 90000);
