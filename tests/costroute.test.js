// Cost-aware routing ("cost" strategy): cheapest sufficient candidate,
// escalation on need, budget caps on paid escalation, decision recorded.
// Mocked fetch only — no network.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { chat, estimateCost, costRateFor } from "../src/agent/providers.js";
import { requiredTier, registerTierClassifier, sortForCost, budgetLeftFor, notePriorFailure, priorFailuresFor } from "../src/agent/freepool/costroute.js";
import { runAgent } from "../src/agent/loop.js";
import { fresh, restore, mockFetch, okChat, toolChat, anthropicOk, FINISH_TOOL, msg } from "./freepool-helpers.js";

after(restore);

const PAID = [{ provider: "anthropic", id: "claude-sonnet-4-6", key: "sk-ant-test-paidkey-000000000000" }];
const TRIVIAL = "Format this list as CSV";
const REASONING = "Compare the two architectures and recommend which trade-off to accept";
const costCall = ({ content, tools = [], paid = PAID, budget = null, convKey = "cost-test" }) =>
  chat({ provider: "freepool", id: "cost", convKey, pool: { paid }, budget }, { system: "s", messages: msg(content), tools, timeoutMs: 30000 });

test("requiredTier: category baseline plus request signals", async () => {
  fresh();
  assert.equal((await requiredTier({ objective: TRIVIAL })).tier, 1);
  assert.equal((await requiredTier({ objective: "Hello there" })).tier, 2, "general -> medium");
  assert.equal((await requiredTier({ objective: "Fix the bug in this function and add a test" })).tier, 3, "coding -> large");
  assert.equal((await requiredTier({ objective: REASONING })).tier, 3, "reasoning -> large");
  const tools = await requiredTier({ objective: TRIVIAL, tools: FINISH_TOOL });
  assert.equal(tools.tier, 2, "tools lift trivial to medium");
  assert.ok(tools.reasons.includes("tools required -> tier 2"));
  assert.equal((await requiredTier({ objective: TRIVIAL, estTokens: 40000 })).tier, 3, "long context -> large");
  assert.equal((await requiredTier({ objective: TRIVIAL, priorFailures: 2 })).tier, 2, "prior failures in run -> +1");
  assert.equal((await requiredTier({ objective: REASONING, priorFailures: 9, estTokens: 99999 })).tier, 4, "capped at frontier");
  notePriorFailure("run-x"); notePriorFailure("run-x");
  assert.equal(priorFailuresFor("run-x"), 2);
  assert.equal(priorFailuresFor("run-y"), 0);
});

test("ladder order: local < free < paid, cheaper first, lowest sufficient tier first", () => {
  const c = (id, o) => ({ id, tier: 2, score: 0.5, free: true, local: false, ...o });
  const sorted = sortForCost([
    c("paid-cheap", { free: false, estCostUsd: 0.001, tier: 4 }),
    c("paid-dear", { free: false, estCostUsd: 0.02, tier: 4 }),
    c("free-t3", { tier: 3, score: 0.9 }),
    c("free-t2", { tier: 2, score: 0.1 }),
    c("local", { local: true, tier: 2 }),
  ]).map((x) => x.id);
  assert.deepEqual(sorted, ["local", "free-t2", "free-t3", "paid-cheap", "paid-dear"]);
  assert.equal(budgetLeftFor("anthropic", null), Infinity);
  assert.equal(budgetLeftFor("anthropic", { usdLeft: 0.5, spendCaps: { anthropic: 0.2 }, spentByProvider: { anthropic: 0.15 } }).toFixed(4), "0.0500");
});

test("trivial task goes to a free tier, never to paid", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_trivial_aaaaaaaaaaaaaaaaaa" });
  const calls = mockFetch(() => okChat("a,b,c"));
  const r = await costCall({ content: TRIVIAL });
  assert.equal(r.servedBy.provider, "groq");
  assert.equal(r.servedBy.model, "llama-3.1-8b-instant", "lowest sufficient tier (1) among free models");
  assert.equal(r.servedBy.free, true);
  assert.equal(r.costUsd, 0);
  assert.equal(r.freepool.strategy, "cost");
  assert.equal(r.freepool.category, "trivial");
  assert.equal(r.freepool.required_tier, 1);
  assert.equal(r.freepool.est_cost_usd, 0);
  assert.deepEqual(r.freepool.escalations, []);
  assert.equal(calls.filter((c) => c.host === "api.anthropic.com").length, 0);
});

test("local endpoint is tried before free tiers", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_local_aaaaaaaaaaaaaaaaaaaa", APE_FREEPOOL_LOCAL_MODEL: "llama3.2:3b", APE_LOCAL_BASE_URL: "http://127.0.0.1:11434/v1" });
  const calls = mockFetch(() => okChat("local"));
  const r = await costCall({ content: TRIVIAL });
  assert.equal(r.servedBy.provider, "local");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].host, "127.0.0.1:11434");
});

test("reasoning escalates to paid only when free tiers fail", async () => {
  // Free succeeds -> paid untouched.
  fresh({ GROQ_API_KEY: "gsk_cost_reason_aaaaaaaaaaaaaaaaaaa" });
  let calls = mockFetch((u, init, all, c) => (c.host === "api.anthropic.com" ? anthropicOk() : okChat("free reasoning")));
  let r = await costCall({ content: REASONING });
  assert.equal(r.servedBy.free, true);
  assert.ok(r.servedBy.tier >= 3, "reasoning needs a large model");
  assert.equal(r.freepool.required_tier, 3);
  assert.equal(calls.filter((c) => c.host === "api.anthropic.com").length, 0, "no paid call when free works");

  // Every free tier-3+ candidate fails (5xx) -> escalate to tier 4 -> paid.
  fresh({ GROQ_API_KEY: "gsk_cost_reason_aaaaaaaaaaaaaaaaaaa" });
  calls = mockFetch((u, init, all, c) => (c.host === "api.anthropic.com" ? anthropicOk("paid reasoning") : { status: 503, body: { error: "overloaded" } }));
  r = await costCall({ content: REASONING });
  assert.equal(r.content, "paid reasoning");
  assert.deepEqual(r.servedBy, { provider: "anthropic", model: "claude-sonnet-4-6", tier: 4, free: false, local: false });
  const hosts = calls.map((c) => c.host);
  const firstPaid = hosts.indexOf("api.anthropic.com");
  assert.equal(firstPaid, hosts.length - 1, "paid tried last, exactly once");
  assert.ok(firstPaid >= 2, "free tier-3 models were tried first");
  assert.ok(calls.slice(0, firstPaid).every((c) => ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct-0905"].includes(c.body.model)), "only tier>=3 free models attempted");
  assert.deepEqual(r.freepool.escalations, [], "tier-4 paid already satisfies tier 3: no escalation needed");
  assert.equal(r.freepool.final_tier, 3);
  assert.equal(r.freepool.paid_reason, `no free candidate available at tier 3 (${firstPaid} free attempts failed)`);
  assert.equal(r.freepool.chosen, "anthropic/claude-sonnet-4-6");
  assert.equal(r.costUsd, Number(estimateCost("claude-sonnet-4-6", { inputTokens: 100, outputTokens: 50 }).toFixed(6)));
  assert.equal(r.costUsd, 0.00105);
  assert.ok(r.freepool.est_cost_usd > 0);
  // Anthropic got the Anthropic tool shape / headers via its own path.
  assert.equal(calls[firstPaid].url, "https://api.anthropic.com/v1/messages");
});

test("budget cap blocks paid escalation (max_usd and per-provider max_spend_usd)", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_budget_aaaaaaaaaaaaaaaaaaa" });
  let calls = mockFetch((u, init, all, c) => (c.host === "api.anthropic.com" ? anthropicOk() : { status: 503, body: {} }));
  await assert.rejects(costCall({ content: REASONING, budget: { usdLeft: 0.0001 } }), (e) => {
    assert.match(e.message, /no candidate served/);
    assert.equal(e.decision.budget_blocked.length, 1);
    assert.match(e.decision.budget_blocked[0], /^anthropic\/claude-sonnet-4-6 est \$[\d.]+ > left \$0\.0001$/);
    return true;
  });
  assert.equal(calls.filter((c) => c.host === "api.anthropic.com").length, 0, "paid never called over budget");

  fresh({ GROQ_API_KEY: "gsk_cost_budget_aaaaaaaaaaaaaaaaaaa" });
  calls = mockFetch((u, init, all, c) => (c.host === "api.anthropic.com" ? anthropicOk() : { status: 503, body: {} }));
  await assert.rejects(costCall({ content: REASONING, budget: { usdLeft: 5, spendCaps: { anthropic: 0.01 }, spentByProvider: { anthropic: 0.0099 } } }), /no candidate served/);
  assert.equal(calls.filter((c) => c.host === "api.anthropic.com").length, 0, "per-provider cap respected");

  // Same failure with room in the budget -> paid serves.
  fresh({ GROQ_API_KEY: "gsk_cost_budget_aaaaaaaaaaaaaaaaaaa" });
  mockFetch((u, init, all, c) => (c.host === "api.anthropic.com" ? anthropicOk() : { status: 503, body: {} }));
  const r = await costCall({ content: REASONING, budget: { usdLeft: 1 } });
  assert.equal(r.servedBy.provider, "anthropic");
});

test("quality failures escalate one tier (empty output, bad tool-call JSON)", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_quality_aaaaaaaaaaaaaaaaaa" });
  let calls = mockFetch((u, init, all) => (all.length === 1 ? okChat("") : okChat("better")));
  let r = await costCall({ content: TRIVIAL, paid: [] });
  assert.equal(calls[0].body.model, "llama-3.1-8b-instant");
  assert.equal(r.content, "better");
  assert.deepEqual(r.freepool.escalations, [{ from: 1, to: 2, reason: "invalid" }]);
  assert.equal(r.servedBy.tier, 2);
  assert.equal(r.freepool.attempts[0].outcome, "invalid");

  fresh({ GROQ_API_KEY: "gsk_cost_quality_aaaaaaaaaaaaaaaaaa" });
  calls = mockFetch((u, init, all) => (all.length === 1 ? toolChat("finish", "{not json") : toolChat("finish", { summary: "ok" })));
  r = await costCall({ content: TRIVIAL, tools: FINISH_TOOL, paid: [] });
  assert.equal(r.freepool.required_tier, 2);
  assert.deepEqual(r.freepool.escalations, [{ from: 2, to: 3, reason: "invalid" }]);
  assert.ok(r.servedBy.tier >= 3);
  assert.deepEqual(r.toolCalls[0].args, { summary: "ok" });

  // 429s are availability, not quality: fail over at the SAME tier.
  fresh({ GROQ_API_KEY: "gsk_cost_quality_aaaaaaaaaaaaaaaaaa", CEREBRAS_API_KEY: "csk-cost-quality-bbbbbbbbbbbbbb" });
  calls = mockFetch((u, init, all) => (all.length === 1 ? { status: 429, body: {}, headers: { "retry-after": "5" } } : okChat("same tier")));
  r = await costCall({ content: TRIVIAL, paid: [] });
  assert.deepEqual(r.freepool.escalations, [], "no escalation on 429");
  assert.equal(r.servedBy.tier, 1);
});

test("pluggable tier classifier hook (learned-router seam)", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_hook_aaaaaaaaaaaaaaaaaaaaa" });
  registerTierClassifier(async ({ objective }) => (objective.includes("hard") ? { tier: 4, reason: "test-model says hard" } : null));
  let calls = mockFetch((u, init, all, c) => (c.host === "api.anthropic.com" ? anthropicOk() : okChat("free")));
  let r = await costCall({ content: "a hard question" });
  assert.equal(r.freepool.tier_source, "hook");
  assert.equal(r.freepool.required_tier, 4);
  assert.equal(r.servedBy.provider, "anthropic", "no free tier-4 groq model -> paid");
  assert.equal(calls.length, 1, "free tier-1..3 models skipped entirely");
  r = await costCall({ content: TRIVIAL });
  assert.equal(r.freepool.tier_source, "rules", "null from hook defers to rules");
  registerTierClassifier(() => { throw new Error("broken plug-in"); });
  calls = mockFetch(() => okChat("free"));
  r = await costCall({ content: TRIVIAL });
  assert.equal(r.freepool.tier_source, "rules", "throwing hook never breaks routing");
  assert.equal(r.servedBy.free, true);
  registerTierClassifier(null);
});

test("free-tier models auto-detected as 'paid' entries stay free", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_dup_aaaaaaaaaaaaaaaaaaaaaa" });
  const calls = mockFetch(() => ({ status: 503, body: {} }));
  await assert.rejects(costCall({ content: REASONING, paid: [{ provider: "groq", id: "llama-3.3-70b-versatile", key: "gsk_cost_dup_aaaaaaaaaaaaaaaaaaaaaa" }] }));
  assert.ok(calls.every((c) => c.host === "api.groq.com"));
  assert.ok(!calls.some((c) => c.body.model === "llama-3.3-70b-versatile"), "tier-2 free model not smuggled in as a paid tier-3 candidate");
});

test("catalog paid rates extend estimateCost; built-in table wins", () => {
  assert.deepEqual(costRateFor("gpt-4.1"), { in: 2, out: 8 });
  assert.equal(costRateFor("deepseek-ai/DeepSeek-V4-Flash-0731").in, 0.3);
  assert.equal(costRateFor("claude-sonnet-4-6-20260101").out, 15, "prefix match on dated ids");
  assert.deepEqual(costRateFor("totally-unknown-model"), { in: 2, out: 8 }, "conservative default");
});

test("agent run: routing decision + served-by recorded in the receipt, free spend is $0", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_receipt_aaaaaaaaaaaaaaaaaa" });
  const calls = mockFetch(() => toolChat("finish", { summary: "listed" }));
  const res = await runAgent({
    profile: {
      name: "cost-receipt",
      model: { provider: "auto", id: "auto" },
      system: "Be careful.",
      tools: [{ builtin: "finish" }],
      limits: { max_steps: 5, max_tokens: 100000, max_wall_seconds: 60, max_usd: 0.5 },
      policy: { verify_before_finish: "off" },
      stop_conditions: ["explicit_final_answer", "budget_exhausted"],
    },
    objective: TRIVIAL,
    resolvedModel: { provider: "freepool", id: "cost", resolution: "cost-routed" },
    resolvedChain: [{ provider: "freepool", id: "cost", resolution: "cost-routed", pool: { paid: [] } }],
  });
  assert.equal(res.stop_reason, "explicit_final_answer");
  assert.equal(res.outcome, "listed");
  assert.equal(res.model_provider, "freepool");
  assert.match(res.served_by, /^groq\//);
  assert.equal(res.total_cost, 0, "free tier costs nothing (no phantom DEFAULT_RATE spend)");
  const fp = res.receipt.freepool;
  assert.equal(fp.served_by, res.served_by);
  assert.equal(fp.turns, 1);
  assert.equal(fp.paid_turns, 0);
  assert.equal(fp.served[res.served_by], 1);
  assert.equal(fp.decisions.length, 1);
  assert.equal(fp.decisions[0].strategy, "cost");
  assert.equal(fp.decisions[0].tier, 2, "trivial + tools -> tier 2");
  assert.equal(fp.decisions[0].category, "trivial");
  assert.equal(fp.decisions[0].chosen, res.served_by);
  assert.equal(fp.decisions[0].est_cost_usd, 0);
  assert.deepEqual(fp.decisions[0].escalations, []);
  assert.equal(res.receipt.spend_by_provider.groq, 0, "spend attributed to the serving upstream");
  assert.equal(calls[0].body.tools[0].function.name, "finish");
  // Receipt survives the worker's 2000-char persistence slice as valid JSON prefix-wise.
  assert.ok(JSON.stringify({ freepool: fp }).length < 800, "freepool receipt block stays compact");
});

test("agent run: paid escalation is billed and attributed to the paid provider", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_receipt2_aaaaaaaaaaaaaaaaa" });
  mockFetch((u, init, all, c) => (c.host === "api.anthropic.com"
    ? { status: 200, body: { content: [{ type: "tool_use", id: "tu1", name: "finish", input: { summary: "paid done" } }], stop_reason: "tool_use", usage: { input_tokens: 200, output_tokens: 40 } } }
    : { status: 503, body: {} }));
  const res = await runAgent({
    profile: {
      name: "cost-receipt-paid",
      model: { provider: "auto", id: "auto" },
      system: "Be careful.",
      tools: [{ builtin: "finish" }],
      limits: { max_steps: 5, max_tokens: 100000, max_wall_seconds: 60, max_usd: 0.5 },
      policy: { verify_before_finish: "off" },
      stop_conditions: ["explicit_final_answer", "budget_exhausted"],
    },
    objective: REASONING,
    resolvedModel: { provider: "freepool", id: "cost", resolution: "cost-routed" },
    resolvedChain: [{ provider: "freepool", id: "cost", resolution: "cost-routed", pool: { paid: PAID } }],
  });
  assert.equal(res.outcome, "paid done");
  assert.equal(res.served_by, "anthropic/claude-sonnet-4-6");
  const expected = Number(estimateCost("claude-sonnet-4-6", { inputTokens: 200, outputTokens: 40 }).toFixed(6));
  assert.equal(res.total_cost, expected);
  assert.equal(res.receipt.spend_by_provider.anthropic, expected);
  assert.equal(res.receipt.freepool.paid_turns, 1);
  assert.match(res.receipt.freepool.decisions[0].paid_reason, /^no free candidate available at tier 3 \(\d+ free attempts failed\)$/);
  assert.equal(res.receipt.freepool.decisions[0].tier, 3);
});

test("quality failure at the top free tier escalates into paid", async () => {
  fresh({ GROQ_API_KEY: "gsk_cost_q2paid_aaaaaaaaaaaaaaaaaaa" });
  const calls = mockFetch((u, init, all, c) => (c.host === "api.anthropic.com" ? anthropicOk("paid fixes it") : okChat("")));
  const r = await costCall({ content: REASONING });
  assert.equal(calls[0].host, "api.groq.com");
  assert.equal(r.servedBy.provider, "anthropic");
  assert.deepEqual(r.freepool.escalations, [{ from: 3, to: 4, reason: "invalid" }]);
  assert.equal(r.freepool.final_tier, 4);
  assert.equal(calls.filter((c) => c.host === "api.groq.com").length, 1, "one bad free answer, then straight to a tier-4 model");
});
