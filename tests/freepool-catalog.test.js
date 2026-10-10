// Catalog refresh merge + discovery (mocked fetch, no network) and bundled
// catalog integrity.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeProvider, mergeCatalog, guessTier, isChatModelId, discoverAll, discoverProvider } from "../src/agent/freepool/catalog-refresh.js";
import { CATALOG_PATH, PROVIDER_SPECS } from "../src/agent/freepool/members.js";
import { fresh, restore } from "./freepool-helpers.js";

after(restore);
const TODAY = "2026-10-10";

test("bundled catalog: well-formed, every provider known, no URLs, no Cohere", () => {
  const raw = readFileSync(CATALOG_PATH, "utf8");
  const cat = JSON.parse(raw);
  assert.equal(cat.schema, 1);
  assert.ok(!/https?:\/\//.test(JSON.stringify(cat.providers)), "egress never comes from the catalog");
  assert.ok(!("cohere" in cat.providers));
  for (const [p, entry] of Object.entries(cat.providers)) {
    assert.ok(PROVIDER_SPECS[p], `${p} has a code-side spec`);
    assert.ok(["ok", "caution"].includes(entry.tos), `${p} tos flagged`);
    assert.ok(entry.models.length > 0);
    for (const m of entry.models) {
      assert.ok(m.tier >= 1 && m.tier <= 4, `${p}/${m.id} tier`);
      assert.equal(typeof m.tools, "boolean", `${p}/${m.id} tools`);
      for (const k of ["rpm", "rpd", "tpm", "tpd"]) assert.ok(m.limits[k] === null || m.limits[k] > 0, `${p}/${m.id} ${k}`);
    }
  }
  for (const p of ["gemini", "nvidia"]) assert.equal(cat.providers[p].tos, "caution", `${p} carries a ToS caution`);
  assert.ok(cat.providers.openrouter.models.every((m) => m.id.endsWith(":free")));
  assert.ok(cat.paid.rates["claude-sonnet-4-6"].tier === 4);
});

test("mergeProvider: curation kept, new ids added conservatively, missing retired, reappearing revived", () => {
  const entry = {
    name: "Groq", tos: "ok",
    models: [
      { id: "keep-70b", tier: 3, speed: 3, context: null, tools: true, limits: { rpm: 30, rpd: 1000, tpm: 6000, tpd: null } },
      { id: "gone-8b", tier: 1, speed: 3, context: 8192, tools: true, limits: {} },
      { id: "back-32b", tier: 2, speed: 2, context: 1, tools: false, limits: {}, retired: "2026-09-01" },
    ],
  };
  const r = mergeProvider(entry, [
    { id: "keep-70b", context: 131072, tools: false },
    { id: "back-32b" },
    { id: "brand-new-120b", context: 65536, tools: true },
    { id: "whisper-large-v3" },
    { id: "nomic-embed-text" },
    { id: "brand-new-120b" },
  ], { provider: "groq", today: TODAY });
  const by = Object.fromEntries(r.entry.models.map((m) => [m.id, m]));
  assert.deepEqual(by["keep-70b"], { id: "keep-70b", tier: 3, speed: 3, context: 131072, tools: true, limits: { rpm: 30, rpd: 1000, tpm: 6000, tpd: null } }, "curated tier/tools/limits win; only missing context filled");
  assert.equal(by["gone-8b"].retired, TODAY);
  assert.equal(by["back-32b"].retired, undefined);
  assert.equal(by["back-32b"].context, 1, "revive keeps curated fields");
  assert.deepEqual(by["brand-new-120b"], { id: "brand-new-120b", tier: 3, speed: 2, context: 65536, tools: true, limits: { rpm: null, rpd: null, tpm: null, tpd: null }, added: TODAY });
  assert.ok(!by["whisper-large-v3"] && !by["nomic-embed-text"], "non-chat ids ignored");
  assert.deepEqual(r.added, ["brand-new-120b"]);
  assert.deepEqual(r.retired, ["gone-8b"]);
  assert.deepEqual(r.revived, ["back-32b"]);
  assert.equal(r.entry.models.length, 4, "duplicates collapsed, nothing deleted");
  // Already-retired entries are not re-reported.
  const again = mergeProvider(r.entry, [{ id: "keep-70b" }, { id: "back-32b" }, { id: "brand-new-120b" }], { provider: "groq", today: "2026-10-11" });
  assert.deepEqual(again.retired, []);
  assert.equal(again.entry.models.find((m) => m.id === "gone-8b").retired, TODAY, "first retirement date kept");
});

test("mergeProvider: new models without a tools signal default to tools=false", () => {
  const r = mergeProvider({ models: [] }, [{ id: "mystery-model" }], { provider: "mistral", today: TODAY });
  assert.equal(r.entry.models[0].tools, false);
  assert.equal(r.entry.models[0].tier, 2);
});

test("mergeCatalog: openrouter keeps only :free ids; empty / failed listings leave providers untouched", () => {
  const cat = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const before = JSON.stringify(cat.providers.groq);
  const { catalog, report, changed } = mergeCatalog(cat, {
    openrouter: [...cat.providers.openrouter.models.map((m) => ({ id: m.id })), { id: "anthropic/claude-sonnet-4-6" }, { id: "new/model:free", tools: true }],
    groq: [],
    cerebras: { error: "discovery failed (401)" },
    bogus: [{ id: "x" }],
  }, { today: TODAY });
  assert.equal(changed, true);
  assert.deepEqual(report.openrouter.added, ["new/model:free"]);
  assert.ok(!catalog.providers.openrouter.models.some((m) => m.id === "anthropic/claude-sonnet-4-6"), "paid id never pooled");
  assert.equal(report.groq.skipped, "empty listing");
  assert.equal(JSON.stringify(catalog.providers.groq), before, "empty listing does not retire everything");
  assert.equal(report.cerebras.skipped, "discovery failed (401)");
  assert.equal(report.bogus.skipped, "unknown provider");
  assert.ok(!("bogus" in catalog.providers));
  assert.equal(catalog.updated, TODAY);
  assert.notEqual(cat.providers.openrouter, catalog.providers.openrouter, "input not mutated in place");
  const noop = mergeCatalog(cat, { openrouter: cat.providers.openrouter.models.map((m) => ({ id: m.id })) }, { today: "2030-01-01" });
  assert.equal(noop.changed, false);
  assert.equal(noop.catalog.updated, cat.updated, "unchanged run keeps the date (no churn PRs)");
});

test("guessTier / isChatModelId heuristics", () => {
  assert.equal(guessTier("llama-3.1-8b-instant"), 1);
  assert.equal(guessTier("llama-3.3-70b-versatile"), 2);
  assert.equal(guessTier("gpt-oss-120b"), 3);
  assert.equal(guessTier("qwen3-coder-480b-a35b"), 4);
  assert.equal(guessTier("gemini-2.5-pro"), 4);
  assert.ok(isChatModelId("meta/llama-3.3-70b-instruct"));
  for (const id of ["whisper-large-v3", "text-embedding-3", "llama-guard-4-12b", "playai-tts", "", null]) assert.equal(isChatModelId(id), false, String(id));
});

test("discovery: only keyed providers queried; each provider's listing shape parsed; errors carry no bodies", async () => {
  fresh();
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), auth: init?.headers?.authorization });
    const u = String(url);
    const j = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (u === "https://api.groq.com/openai/v1/models") return j({ data: [{ id: "llama-3.1-8b-instant", context_window: 131072 }] });
    if (u === "https://generativelanguage.googleapis.com/v1beta/openai/models") return j({ data: [{ id: "models/gemini-2.5-flash" }] });
    if (u === "https://openrouter.ai/api/v1/models") return j({ data: [{ id: "x/y:free", context_length: 4096, supported_parameters: ["tools", "temperature"] }] });
    if (u.startsWith("https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/models/search")) return j({ result: [{ name: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", properties: [{ property_id: "context_window", value: "24000" }, { property_id: "function_calling", value: "true" }] }] });
    if (u === "https://api.mistral.ai/v1/models") return j({ error: "secret-echo gsk_shouldnotappear" }, 401);
    return j({}, 404);
  };
  const env = {
    GROQ_API_KEY: "gsk_disc_a", GEMINI_API_KEY: "AIza_disc_b", OPENROUTER_API_KEY: "sk-or-disc", GITHUB_TOKEN: "ghp_disc",
    CLOUDFLARE_API_TOKEN: "cf_disc", CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", MISTRAL_API_KEY: "mist_disc",
  };
  const res = await discoverAll({ env, fetchImpl });
  assert.deepEqual(Object.keys(res).sort(), ["cloudflare", "gemini", "groq", "mistral", "openrouter"], "unkeyed providers (and a bare GITHUB_TOKEN) not queried");
  assert.ok(!seen.some((s) => /cerebras|nvidia|huggingface|opencode|models\.github\.ai/.test(s.url)));
  assert.deepEqual(res.groq, [{ id: "llama-3.1-8b-instant", context: 131072, tools: undefined }]);
  assert.equal(res.gemini[0].id, "gemini-2.5-flash", "models/ prefix stripped");
  assert.deepEqual(res.openrouter, [{ id: "x/y:free", context: 4096, tools: true }]);
  assert.deepEqual(res.cloudflare, [{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", context: 24000, tools: true }]);
  assert.deepEqual(res.mistral, { error: "discovery failed (401)" });
  assert.ok(!JSON.stringify(res).includes("gsk_shouldnotappear"));
  assert.equal(seen.find((s) => s.url.includes("groq")).auth, "Bearer gsk_disc_a");
  assert.equal(await discoverProvider("groq", { env: {}, fetchImpl }), null, "no key -> not queried");
});

test("catalog merge: hand-excluded models are kept as-is and never revived", async () => {
  const { mergeProvider } = await import("../src/agent/freepool/catalog-refresh.js");
  const entry = { models: [{ id: "allam-2-7b", tier: 1, tools: false, excluded: true }] };
  const { entry: out, added, revived, retired } = mergeProvider(entry, [{ id: "allam-2-7b" }], { provider: "groq", today: "2026-10-10" });
  assert.equal(out.models.length, 1);
  assert.equal(out.models[0].excluded, true);
  assert.deepEqual([added, revived, retired], [[], [], []]);
});
