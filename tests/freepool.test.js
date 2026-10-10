// freepool provider: selection, failover, cooldowns, limits, UTC reset,
// tool filtering, key hygiene. Mocked fetch only — no network.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "../src/sqlite.js";
import { chat, egressHosts, CALLABLE_PROVIDERS, resolveModel, toolSchemas } from "../src/agent/providers.js";
import { freepoolStatus, freepoolModels, validateResponse, parseFreepoolId } from "../src/agent/freepool/index.js";
import { poolMembers, freepoolEgressHosts, keysFor, PROVIDER_SPECS, EXCLUDED_PROVIDERS, loadCatalog, _setCatalogForTest, _resetCatalogCache } from "../src/agent/freepool/members.js";
import { buildCandidates } from "../src/agent/freepool/select.js";
import { parseRateHeaders, parseLimitFromBody, parseRetryAfter, parseDuration, classifyFailure } from "../src/agent/freepool/ratelimits.js";
import * as L from "../src/agent/freepool/ledger.js";
import { fresh, restore, mockFetch, okChat, toolChat, FINISH_TOOL, msg } from "./freepool-helpers.js";

after(restore);

const GROQ_LLAMA = "groq/llama-3.3-70b-versatile";
const call = (id, { tools = [], content = "hi", timeoutMs = 30000 } = {}) =>
  chat({ provider: "freepool", id, convKey: "t" }, { system: "s", messages: msg(content), tools, timeoutMs });

test("freepool is a callable provider and resolves only with members", async () => {
  fresh();
  assert.ok(CALLABLE_PROVIDERS.has("freepool"));
  const none = await resolveModel({ provider: "freepool", id: "auto" }, { provider: "freepool" });
  assert.equal(none.error, "provider_unavailable");
  assert.match(none.hint, /GROQ_API_KEY/);
  fresh({ GROQ_API_KEY: "gsk_test_resolve_aaaaaaaaaaaaaaaaaaaa" });
  const r = await resolveModel({ provider: "freepool", id: "auto" }, { provider: "freepool", model: "fast" });
  assert.equal(r.provider, "freepool");
  assert.equal(r.id, "fast");
  assert.equal(r.key, null, "resolution never carries a pool key");
  assert.equal(r.source, "freepool (groq)");
});

test("missing-key members are skipped silently and never attempted", async () => {
  fresh({ CEREBRAS_API_KEY: "csk-only-cerebras-key-1234567890" });
  const calls = mockFetch(() => okChat("from cerebras"));
  const r = await call("auto");
  assert.equal(r.servedBy.provider, "cerebras");
  assert.equal(r.content, "from cerebras");
  assert.deepEqual([...new Set(calls.map((c) => c.host))], ["api.cerebras.ai"], "only the keyed member is contacted");
  assert.deepEqual(poolMembers().map((m) => m.provider), ["cerebras"]);
  const inv = freepoolStatus().members;
  assert.equal(inv.find((m) => m.provider === "groq").key_present, false);
  assert.equal(inv.find((m) => m.provider === "cerebras").key_present, true);
  assert.equal(inv.find((m) => m.provider === "cerebras").key_count, 1);
  // Cloudflare needs BOTH the token and a well-formed account id.
  fresh({ CLOUDFLARE_API_TOKEN: "cf-token-xxxxxxxxxxxxxxxx" });
  assert.equal(poolMembers().length, 0, "token without account id is not a member");
  fresh({ CLOUDFLARE_API_TOKEN: "cf-token-xxxxxxxxxxxxxxxx", CLOUDFLARE_ACCOUNT_ID: "../evil" });
  assert.equal(poolMembers().length, 0, "malformed account id never shapes a URL");
  fresh({ CLOUDFLARE_API_TOKEN: "cf-token-xxxxxxxxxxxxxxxx", CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef" });
  assert.equal(poolMembers()[0].baseUrl, "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1");
});

test("no members at all: honest error, zero fetches", async () => {
  fresh();
  const calls = mockFetch(() => okChat());
  await assert.rejects(call("auto"), /no members configured/);
  assert.equal(calls.length, 0);
});

test("failover on 429: next candidate serves, the 429'd one is benched", async () => {
  fresh({ GROQ_API_KEY: "gsk_failover_aaaaaaaaaaaaaaaaaaaaaa", CEREBRAS_API_KEY: "csk-failover-bbbbbbbbbbbbbbbb" });
  let first = null;
  const calls = mockFetch((u, init, all, c) => {
    const target = `${c.host}|${c.body.model}`;
    if (!first) first = target;
    if (target === first) return { status: 429, body: { error: { message: "rate limited" } }, headers: { "retry-after": "30" } };
    return okChat("second");
  });
  const r = await call("fast");
  assert.equal(r.content, "second");
  assert.equal(calls.length, 2, "exactly one failover");
  assert.notEqual(`${calls[1].host}|${calls[1].body.model}`, first);
  assert.equal(r.freepool.attempts[0].outcome, "rate_limit");
  assert.equal(r.freepool.attempts[0].status, 429);
  assert.equal(r.freepool.attempts[1].outcome, "ok");
  assert.equal(r.servedBy.model, calls[1].body.model, "servedBy names the upstream that answered");
  const [host, model] = first.split("|");
  const provider = host === "api.groq.com" ? "groq" : "cerebras";
  const key = provider === "groq" ? "gsk_failover_aaaaaaaaaaaaaaaaaaaaaa" : "csk-failover-bbbbbbbbbbbbbbbb";
  const cd = L.cooldown(provider, model, L.keyHash(key));
  assert.ok(cd, "429 benched the model+key");
  assert.equal(cd.reason, "429 retry-after");
  const secs = (cd.until - Date.now()) / 1000;
  assert.ok(secs > 25 && secs <= 30.5, `retry-after honoured (${secs}s)`);
});

test("cooldown: benched candidate is not attempted until it expires", async () => {
  const t0 = Date.UTC(2026, 9, 10, 12, 0, 0);
  fresh({ GROQ_API_KEY: "gsk_cooldown_aaaaaaaaaaaaaaaaaaaaaa" });
  L._setClock(() => clock);
  let clock = t0;
  let mode = "429";
  const calls = mockFetch(() => (mode === "429" ? { status: 429, body: { error: "slow down" }, headers: { "retry-after": "30" } } : okChat("back")));
  await assert.rejects(call(GROQ_LLAMA), /no candidate served/);
  assert.equal(calls.length, 1);
  mode = "ok";
  await assert.rejects(call(GROQ_LLAMA), /no candidate served/, "still cooling");
  assert.equal(calls.length, 1, "no request while benched");
  clock = t0 + 29000;
  await assert.rejects(call(GROQ_LLAMA));
  assert.equal(calls.length, 1, "29s < 30s retry-after");
  clock = t0 + 31000;
  const r = await call(GROQ_LLAMA);
  assert.equal(r.content, "back");
  assert.equal(calls.length, 2);
});

test("429 without retry-after climbs the strike ladder; daily 429 benches until UTC midnight", async () => {
  const t0 = Date.UTC(2026, 9, 10, 15, 0, 0);
  fresh({ GROQ_API_KEY: "gsk_ladder_aaaaaaaaaaaaaaaaaaaaaaaa" });
  let clock = t0;
  L._setClock(() => clock);
  let body = { error: "Too many requests" };
  mockFetch(() => ({ status: 429, body }));
  const kh = L.keyHash("gsk_ladder_aaaaaaaaaaaaaaaaaaaaaaaa");
  await assert.rejects(call(GROQ_LLAMA));
  assert.equal(L.cooldown("groq", "llama-3.3-70b-versatile", kh).until, t0 + 60000, "strike 1 = 1 min");
  clock = t0 + 61000;
  await assert.rejects(call(GROQ_LLAMA));
  assert.equal(L.cooldown("groq", "llama-3.3-70b-versatile", kh).until, clock + 600000, "strike 2 = 10 min");
  // Groq-style daily-quota body: learns the RPD ceiling and benches to midnight.
  clock = t0 + 61000 + 601000;
  body = "Rate limit reached for model `llama-3.3-70b-versatile` on requests per day (RPD): Limit 1000, Used 1000, Requested 1.";
  await assert.rejects(call(GROQ_LLAMA));
  assert.equal(L.cooldown("groq", "llama-3.3-70b-versatile", kh).until, Date.UTC(2026, 9, 11), "benched until next UTC midnight");
  assert.equal(L.learnedLimits("groq", "llama-3.3-70b-versatile", kh).rpd, 1000, "RPD learned from the 429 body");
});

test("limit enforcement: ceilings learned from headers stop requests at the limit", async () => {
  const t0 = Date.UTC(2026, 9, 10, 23, 58, 0);
  fresh({ GROQ_API_KEY: "gsk_limits_aaaaaaaaaaaaaaaaaaaaaaaa" });
  let clock = t0;
  L._setClock(() => clock);
  // Groq: unsuffixed x-ratelimit-limit-requests is PER DAY.
  const calls = mockFetch(() => ({ ...okChat("ok"), headers: { "x-ratelimit-limit-requests": "2", "x-ratelimit-limit-tokens": "6000" } }));
  await call(GROQ_LLAMA);
  clock += 1000;
  await call(GROQ_LLAMA);
  assert.equal(calls.length, 2);
  const kh = L.keyHash("gsk_limits_aaaaaaaaaaaaaaaaaaaaaaaa");
  const learned = L.learnedLimits("groq", "llama-3.3-70b-versatile", kh);
  assert.equal(learned.rpd, 2);
  assert.equal(learned.tpm, 6000);
  clock += 1000;
  await assert.rejects(call(GROQ_LLAMA), /no candidate served/);
  assert.equal(calls.length, 2, "third request refused locally, never sent");
  const st = freepoolStatus().active[0].models.find((m) => m.id === "llama-3.3-70b-versatile").keys[0];
  assert.equal(st.headroom.rpd, 0);
  assert.equal(st.used.rpd, 2);
  assert.equal(st.used.tpd, 30, "tokens counted from usage (2 x 15)");

  // UTC reset: the day window resets at 00:00 UTC, not 24h after first use.
  clock = Date.UTC(2026, 9, 11, 0, 0, 5);
  const r = await call(GROQ_LLAMA);
  assert.equal(r.content, "ok");
  assert.equal(calls.length, 3, "allowed again right after UTC midnight");
  assert.equal(L.usage("groq", "llama-3.3-70b-versatile", kh).rpd, 1, "new day counts from zero");
});

test("UTC day window: usage just before midnight does not count after it; minute window spans midnight", () => {
  fresh();
  const kh = L.keyHash("k");
  let clock = Date.UTC(2026, 9, 10, 23, 59, 50);
  L._setClock(() => clock);
  L.recordUsage("groq", "m", kh, 100);
  assert.deepEqual(L.usage("groq", "m", kh), { rpm: 1, tpm: 100, rpd: 1, tpd: 100 });
  clock = Date.UTC(2026, 9, 11, 0, 0, 20);
  assert.deepEqual(L.usage("groq", "m", kh), { rpm: 1, tpm: 100, rpd: 0, tpd: 0 }, "day reset, minute still sliding");
  clock = Date.UTC(2026, 9, 11, 0, 1, 0);
  assert.deepEqual(L.usage("groq", "m", kh), { rpm: 0, tpm: 0, rpd: 0, tpd: 0 });
  assert.equal(L.nextUtcMidnight(Date.UTC(2026, 9, 10, 23, 59, 59)), Date.UTC(2026, 9, 11));
});

test("TPM enforcement: a request bigger than the remaining token budget is not sent", async () => {
  fresh({ GROQ_API_KEY: "gsk_tpm_aaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  const kh = L.keyHash("gsk_tpm_aaaaaaaaaaaaaaaaaaaaaaaaaaa");
  L.learnLimits("groq", "llama-3.3-70b-versatile", kh, { tpm: 1000 }, "test");
  const calls = mockFetch(() => okChat());
  await assert.rejects(call(GROQ_LLAMA, { content: "x".repeat(8000) }), /no candidate served/);
  assert.equal(calls.length, 0, "~2000 estimated tokens > 1000 TPM: refused locally");
  const r = await call(GROQ_LLAMA, { content: "short" });
  assert.equal(r.content, "ok");
});

test("multiple keys rotate; a 429 on one key fails over to the next key", async () => {
  fresh({ GROQ_API_KEY: "gsk_key_one_aaaaaaaaaaaaaaaaaaaaa, gsk_key_two_bbbbbbbbbbbbbbbbbbbbb" });
  assert.equal(keysFor("groq").length, 2, "comma-separated, trimmed");
  let calls = mockFetch(() => okChat());
  await call(GROQ_LLAMA);
  await call(GROQ_LLAMA);
  assert.deepEqual(calls.map((c) => c.auth), ["Bearer gsk_key_one_aaaaaaaaaaaaaaaaaaaaa", "Bearer gsk_key_two_bbbbbbbbbbbbbbbbbbbbb"], "least-used key goes next");

  fresh({ GROQ_API_KEY: "gsk_key_one_aaaaaaaaaaaaaaaaaaaaa,gsk_key_two_bbbbbbbbbbbbbbbbbbbbb" });
  calls = mockFetch((u, init, all, c) => (c.auth.endsWith("aaaaa") ? { status: 429, body: {}, headers: { "retry-after": "60" } } : okChat("k2")));
  const r = await call(GROQ_LLAMA);
  assert.equal(r.servedBy.key_slot, 1);
  assert.equal(calls.length, 2);
  await call(GROQ_LLAMA);
  assert.equal(calls.length, 3, "benched key skipped on the next call");
  assert.ok(calls[2].auth.endsWith("bbbbb"));
});

test("5xx failover is bounded by max attempts", async () => {
  fresh({ GROQ_API_KEY: "gsk_bound_aaaaaaaaaaaaaaaaaaaaaaaa", APE_FREEPOOL_MAX_ATTEMPTS: "3" });
  const calls = mockFetch(() => ({ status: 503, body: { error: "overloaded" } }));
  await assert.rejects(call("auto"), (e) => {
    assert.match(e.message, /max_attempts/);
    assert.equal(e.decision.attempts.length, 3);
    assert.ok(e.decision.attempts.every((a) => a.outcome === "server" && a.status === 503));
    return true;
  });
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map((c) => c.body.model)).size, 3, "each attempt is a different candidate");
});

test("wall budget bounds the whole failover walk", async () => {
  fresh({ GROQ_API_KEY: "gsk_wall_aaaaaaaaaaaaaaaaaaaaaaaaa" });
  const calls = mockFetch(() => ({ status: 503, body: {}, delayMs: 80 }));
  const t0 = Date.now();
  await assert.rejects(call("auto", { timeoutMs: 120 }), /wall_budget/);
  assert.ok(calls.length <= 2, `at most 2 attempts in 120ms (got ${calls.length})`);
  assert.ok(Date.now() - t0 < 1000);
});

test("timeouts fail over and bench briefly", async () => {
  fresh({ GROQ_API_KEY: "gsk_timeout_aaaaaaaaaaaaaaaaaaaaaaa", APE_FREEPOOL_ATTEMPT_TIMEOUT_MS: "100" });
  const calls = mockFetch((u, init, all) => (all.length === 1 ? { ...okChat("too late"), delayMs: 5000 } : okChat("fast one")));
  const t0 = Date.now();
  const r = await call("auto");
  assert.ok(Date.now() - t0 < 2000, "hung attempt aborted at the per-attempt cap");
  assert.equal(r.content, "fast one");
  assert.equal(r.freepool.attempts[0].outcome, "timeout");
  assert.equal(calls.length, 2);
  const [, model] = [null, calls[0].body.model];
  const cd = L.cooldown("groq", model, L.keyHash("gsk_timeout_aaaaaaaaaaaaaaaaaaaaaaa"));
  assert.equal(cd.reason, "timeout");
  assert.ok(cd.until - Date.now() <= 30000 && cd.until - Date.now() > 25000, "short 30s bench");
});

test("invalid output (empty / bad tool JSON / unknown tool) fails over", async () => {
  assert.equal(validateResponse({ content: "  ", toolCalls: [] }), "empty output");
  assert.equal(validateResponse({ content: "", toolCalls: [{ name: "finish", args: { raw: "{bad" } }] }, new Set(["finish"])), "tool-call arguments are not valid JSON");
  assert.equal(validateResponse({ content: "", toolCalls: [{ name: "rm_rf", args: {} }] }, new Set(["finish"])), "unknown tool: rm_rf");
  assert.equal(validateResponse({ content: "fine", toolCalls: [] }), null);
  fresh({ GROQ_API_KEY: "gsk_invalid_aaaaaaaaaaaaaaaaaaaaaaa" });
  const calls = mockFetch((u, init, all) => (all.length === 1 ? okChat("") : okChat("real answer")));
  const r = await call("auto");
  assert.equal(r.content, "real answer");
  assert.equal(r.freepool.attempts[0].outcome, "invalid");
  assert.equal(calls.length, 2);
});

test("tool calls keep working through the pool (openaiChat path)", async () => {
  fresh({ GROQ_API_KEY: "gsk_tools_aaaaaaaaaaaaaaaaaaaaaaaaa" });
  const calls = mockFetch(() => toolChat("finish", { summary: "done" }));
  const tools = toolSchemas({ provider: "freepool" }, [{ name: "finish", description: "f", inputSchema: { type: "object", properties: { summary: { type: "string" } } } }]);
  assert.equal(tools[0].type, "function", "freepool uses the OpenAI tool shape");
  const r = await call(GROQ_LLAMA, { tools });
  assert.deepEqual(r.toolCalls, [{ id: "call_1", name: "finish", args: { summary: "done" } }]);
  assert.equal(calls[0].body.tools.length, 1);
  assert.equal(calls[0].body.tool_choice, "auto");
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  // No tools: neither tools nor tool_choice is sent (some hosts reject the pair half-set).
  await call(GROQ_LLAMA);
  assert.equal("tools" in calls[1].body, false);
  assert.equal("tool_choice" in calls[1].body, false);
});

// Synthetic catalog: groq with one tool-less model and small (8k) contexts,
// so tool filtering and the context cap are exercised on a live member.
function withGroqFixture(fn) {
  const base = JSON.parse(JSON.stringify(loadCatalog()));
  const lim = { rpm: 30, rpd: 1000, tpm: null, tpd: null };
  base.providers.groq = {
    ...base.providers.groq,
    models: [
      { id: "fixture/tools-small", tier: 2, speed: 3, context: 8000, tools: true, limits: lim },
      { id: "fixture/tools-big", tier: 3, speed: 2, context: 8000, tools: true, limits: lim },
      { id: "fixture/no-tools", tier: 2, speed: 3, context: 8000, tools: false, limits: lim },
    ],
  };
  _setCatalogForTest(base);
  const done = () => _resetCatalogCache();
  try {
    const r = fn();
    if (r && typeof r.then === "function") return r.finally(done);
    done();
    return r;
  } catch (e) { done(); throw e; }
}

test("tool-requiring calls route only to tool-capable models", () => withGroqFixture(async () => {
  fresh({ GROQ_API_KEY: "gsk_tooltest_aaaaaaaaaaaaaaaaaaaaaa" });
  const members = poolMembers();
  const withTools = buildCandidates(members, { strategy: "auto", needTools: true, estTokens: 10 });
  assert.ok(withTools.candidates.length > 0);
  assert.ok(withTools.candidates.every((c) => c.tools), "every candidate supports tools");
  assert.ok(withTools.skipped.some((s) => s.id === "groq/fixture/no-tools" && s.reason === "no tool support"));
  const noTools = buildCandidates(members, { strategy: "auto", needTools: false, estTokens: 10 });
  assert.ok(noTools.candidates.some((c) => c.model === "fixture/no-tools"), "tool-less model is fine without tools");
  const calls = mockFetch(() => toolChat("finish", { summary: "x" }));
  await assert.rejects(call("groq/fixture/no", { tools: FINISH_TOOL }), /no candidate served/);
  assert.equal(calls.length, 0, "never sent to a tool-less model");
  const r = await call("groq/", { tools: FINISH_TOOL });
  assert.ok(r.servedBy.model !== "fixture/no-tools");
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
}));

test("context filter: oversized prompts skip small-context models", () => withGroqFixture(() => {
  fresh({ GROQ_API_KEY: "gsk_ctx_aaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  const { candidates, skipped } = buildCandidates(poolMembers(), { strategy: "auto", estTokens: 9000 });
  assert.equal(candidates.length, 0, "every fixture model caps input at 8k");
  assert.ok(skipped.length === 3 && skipped.every((s) => /context 8000 < estimated 9000/.test(s.reason)));
}));

test("GitHub Models is retired: GITHUB_TOKEN alone yields no pool members", async () => {
  fresh({ GITHUB_TOKEN: "ghp_retired_aaaaaaaaaaaaaaaaaaaaaaaaaa", GITHUB_MODELS_TOKEN: "github_pat_retired_bbbbbbbbbbbbbbbb" });
  assert.ok(!("github" in PROVIDER_SPECS), "no github member spec");
  assert.ok(!("github" in loadCatalog().providers), "no github catalog entry");
  assert.deepEqual(poolMembers(), []);
  assert.ok(freepoolStatus().members.every((m) => !m.key_present), "no member reports a key from GITHUB_TOKEN");
  assert.ok(!freepoolEgressHosts().includes("https://models.github.ai"));
  const calls = mockFetch(() => okChat());
  await assert.rejects(call("auto"), /no members configured/);
  assert.equal(calls.length, 0);
});

test("non-JSON 2xx is an invalid upstream: benched with a cooldown, not 'network'", async () => {
  const KEY = "gsk_nonjson_aaaaaaaaaaaaaaaaaaaaaaaa";
  fresh({ GROQ_API_KEY: KEY, CEREBRAS_API_KEY: "csk-nonjson-bbbbbbbbbbbbbbbbbbbb" });
  // Groq answers like the retired GitHub Models endpoint: 200 text/plain "OK".
  const calls = mockFetch((u, init, all, c) => (c.host === "api.groq.com"
    ? { status: 200, body: "OK", headers: { "content-type": "text/plain; charset=utf-8" } }
    : okChat("from cerebras")));
  let err = null;
  await assert.rejects(call("groq/"), (e) => { err = e; return true; });
  assert.match(err.message, /non-JSON 2xx from api\.groq\.com/);
  assert.equal(err.decision.attempts[0].outcome, "upstream_invalid");
  assert.equal(err.decision.attempts[0].status, 200);
  assert.ok(err.decision.attempts.every((a) => a.outcome !== "network"));
  assert.equal(calls.length, 1, "the whole host/key is benched after one bad 2xx");
  const cd = L.cooldown("groq", "any-model", L.keyHash(KEY));
  assert.equal(cd?.scope, "key");
  assert.match(cd.reason, /^invalid upstream: non-JSON 2xx from api\.groq\.com/);
  const mins = (cd.until - Date.now()) / 60000;
  assert.ok(mins > 14 && mins <= 15.1, `15 min bench (${mins})`);
  const r = await call("auto");
  assert.equal(r.servedBy.provider, "cerebras", "pool fails over past the benched host");
  assert.equal(calls.filter((c) => c.host === "api.groq.com").length, 1, "benched host not retried");

  // JSON content-type but a body that does not parse: same class.
  fresh({ GROQ_API_KEY: KEY });
  mockFetch(() => ({ status: 200, body: "<html>gateway</html>" }));
  await assert.rejects(call("groq/"), (e) => /non-JSON 2xx from api\.groq\.com \(body is not valid JSON\)/.test(e.message) && e.decision.attempts[0].outcome === "upstream_invalid");
  assert.equal(classifyFailure({ upstreamInvalid: true, status: 200 }), "upstream_invalid");
});
test("strategies order candidates differently (fast vs smart)", () => {
  fresh({ GROQ_API_KEY: "gsk_strat_aaaaaaaaaaaaaaaaaaaaaaaa", GEMINI_API_KEY: "AIzaStrategyTestKey000000000000" });
  const members = poolMembers();
  const fast = buildCandidates(members, { strategy: "fast", estTokens: 10 }).candidates[0];
  const smart = buildCandidates(members, { strategy: "smart", estTokens: 10 }).candidates[0];
  assert.equal(fast.provider, "groq", "fast prefers the speed-3 host");
  assert.equal(smart.model, "gemini-2.5-pro", "smart prefers the frontier-tier model");
  assert.deepEqual(parseFreepoolId("smart"), { strategy: "smart", pin: null });
  assert.deepEqual(parseFreepoolId("groq/llama"), { strategy: "auto", pin: "groq/llama" });
  assert.deepEqual(parseFreepoolId(undefined), { strategy: "auto", pin: null });
});

test("key hygiene: only key hashes reach the DB; errors echoing keys are redacted", async () => {
  const KEY = "gsk_SuperSecretRawKeyValue0123456789";
  const KEY2 = "csk-SecondSecretKeyValue9876543210";
  const dir = fresh({ GROQ_API_KEY: KEY, CEREBRAS_API_KEY: KEY2 });
  const calls = mockFetch((u, init, all, c) => (c.host === "api.groq.com"
    ? { status: 401, body: `invalid api key ${KEY} provided` }
    : okChat("ok")));
  await assert.rejects(call("groq/"), (e) => !e.message.includes(KEY));
  assert.equal(calls.length, 1, "401 benches the whole key: no second groq model tried");
  const ok = await call("cerebras/");
  assert.equal(ok.servedBy.provider, "cerebras");
  const kh = L.keyHash(KEY);
  assert.match(kh, /^[0-9a-f]{16}$/);
  const status = freepoolStatus();
  const statusText = JSON.stringify(status);
  assert.ok(!statusText.includes(KEY), "status never shows the key");
  assert.ok(!statusText.includes(kh), "status shows slots, not even hashes");
  const failed = status.active[0].models.flatMap((m) => m.keys).find((k) => k.last_error);
  assert.ok(failed && failed.last_error.includes("[redacted]"), "echoed key scrubbed in last_error");
  L._closeLedger();
  const files = readdirSync(dir);
  assert.ok(files.includes("freepool.db"));
  for (const f of files) {
    const bytes = readFileSync(join(dir, f));
    for (const k of [KEY, KEY2]) {
      assert.ok(!bytes.includes(Buffer.from(k)), `${f} contains no raw key`);
      assert.ok(!bytes.includes(Buffer.from(k.slice(4, 24))), `${f} contains no key fragment`);
    }
  }
  const db = new DatabaseSync(join(dir, "freepool.db"), { readOnly: true });
  const rows = db.prepare("SELECT DISTINCT key_hash FROM fp_state ORDER BY key_hash").all().map((r) => r.key_hash);
  const usageRows = db.prepare("SELECT DISTINCT key_hash FROM fp_usage ORDER BY key_hash").all().map((r) => r.key_hash);
  db.close();
  assert.deepEqual(rows, [kh, L.keyHash(KEY2)].sort(), "state rows keyed by hash");
  assert.deepEqual(usageRows, [kh, L.keyHash(KEY2)].sort(), "usage rows keyed by hash");
  // 401 benches the key for every model (key-wide cooldown).
  const cd = L.cooldown("groq", "some-other-model", kh);
  assert.equal(cd?.scope, "key");
});

test("egress: every pool host is listed; Cohere is never a member", () => {
  fresh();
  const all = egressHosts();
  for (const h of freepoolEgressHosts()) assert.ok(all.includes(h), `${h} in egressHosts`);
  for (const h of ["https://api.cerebras.ai", "https://api.mistral.ai", "https://integrate.api.nvidia.com", "https://api.cloudflare.com", "https://router.huggingface.co", "https://generativelanguage.googleapis.com", "https://openrouter.ai", "https://api.groq.com", "https://opencode.ai"]) {
    assert.ok(all.includes(h), h);
  }
  assert.ok(!all.some((h) => /cohere/.test(h)));
  assert.ok(!all.includes("https://models.github.ai"), "retired GitHub Models host is not egress");
  assert.ok(!("cohere" in PROVIDER_SPECS));
  assert.ok(EXCLUDED_PROVIDERS.cohere);
  fresh({ COHERE_API_KEY: "co-xxxxxxxxxxxxxxxx" });
  assert.equal(poolMembers().length, 0);
});

test("openrouter: only :free models join the pool", () => {
  fresh({ OPENROUTER_API_KEY: "sk-or-v1-test-aaaaaaaaaaaaaaaa" });
  const m = poolMembers()[0];
  assert.equal(m.provider, "openrouter");
  assert.ok(m.models.length > 0 && m.models.every((x) => x.id.endsWith(":free")));
  assert.ok(freepoolModels({ provider: "openrouter" }).models.every((x) => x.id.endsWith(":free")));
});

test("local endpoint joins only when configured and is attempted keyless", async () => {
  fresh({ APE_FREEPOOL_LOCAL_MODEL: "qwen2.5:7b", APE_LOCAL_BASE_URL: "http://127.0.0.1:11434/v1" });
  const calls = mockFetch(() => okChat("local says hi"));
  const r = await call("auto");
  assert.equal(r.servedBy.provider, "local");
  assert.equal(r.servedBy.local, true);
  assert.equal(calls[0].url, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(calls[0].auth, null, "no credential sent to local");
});

test("rate-limit header + body parsing", () => {
  const now = Date.UTC(2026, 0, 1);
  const groq = parseRateHeaders({ "x-ratelimit-limit-requests": "1000", "x-ratelimit-limit-tokens": "12000", "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "2m30s" }, { requestsMeaning: "day", nowMs: now });
  assert.deepEqual(groq.limits, { rpd: 1000, tpm: 12000 });
  assert.equal(groq.exhaustedUntil, now + 150000);
  assert.equal(groq.exhaustedWindow, "rpd");
  const cer = parseRateHeaders(new Headers({ "x-ratelimit-limit-requests-day": "14400", "x-ratelimit-limit-tokens-minute": "60000", "x-ratelimit-remaining-tokens-minute": "50" }), { nowMs: now });
  assert.deepEqual(cer.limits, { rpd: 14400, tpm: 60000 });
  assert.equal(cer.exhaustedUntil, null);
  const generic = parseRateHeaders({ "x-ratelimit-limit-requests": "20" }, { nowMs: now });
  assert.deepEqual(generic.limits, { rpm: 20 }, "unsuffixed requests = per minute by default");
  assert.deepEqual(parseLimitFromBody("on tokens per minute (TPM): Limit 6000, Used 5800"), { limits: { tpm: 6000 }, window: "minute" });
  assert.equal(parseLimitFromBody("quota exceeded for the day").window, "day");
  assert.equal(parseDuration("1h2m3.5s"), 3723500);
  assert.equal(parseDuration("850ms"), 850);
  assert.equal(parseDuration("7"), 7000);
  assert.equal(parseDuration("soon"), null);
  assert.equal(parseRetryAfter("12", now), 12000);
  assert.equal(parseRetryAfter(new Date(now + 5000).toUTCString(), now), 5000);
  assert.equal(classifyFailure({ status: 429 }), "rate_limit");
  assert.equal(classifyFailure({ status: 502 }), "server");
  assert.equal(classifyFailure({ status: 401 }), "auth");
  assert.equal(classifyFailure({ status: 404 }), "not_found");
  assert.equal(classifyFailure({ status: 400 }), "bad_request");
  assert.equal(classifyFailure({ invalid: true, status: 200 }), "invalid");
});

test("ape_freepool_status / ape_freepool_models MCP tools: complete, no secrets", async () => {
  const KEY = "gsk_mcp_tool_secret_aaaaaaaaaaaaaaaaaa";
  fresh({ GROQ_API_KEY: KEY });
  const { dispatchCall } = await import("../src/server.js");
  const s = await dispatchCall("ape_freepool_status", {});
  assert.equal(s.resultType, "complete");
  const res = s.structuredContent.result;
  assert.equal(res.active_count, 1);
  assert.equal(res.members.find((m) => m.provider === "groq").key_present, true);
  assert.ok(res.egress_hosts.includes("https://api.groq.com"));
  assert.ok(!JSON.stringify(s).includes(KEY));
  const m = await dispatchCall("ape_freepool_models", { tools: true });
  const mr = m.structuredContent.result;
  assert.ok(mr.count > 0 && mr.models.every((x) => x.tools));
  assert.ok(mr.models.some((x) => x.provider === "groq" && x.available));
  assert.ok(mr.models.some((x) => x.provider === "cerebras" && !x.available));
});
