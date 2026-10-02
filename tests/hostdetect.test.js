import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// Isolate user config: resolveModel now reads APE_DATA_DIR/config.json, so a
// stray repo pin would leak into these tests (same guard as scripts/test.mjs).
process.env.APE_DATA_DIR ??= mkdtempSync(join(tmpdir(), "ape-hostdetect-"));
import { DatabaseSync } from "node:sqlite";
import { resolveModel, userDefaults, defaultModelFor } from "../src/agent/providers.js";
import { opencodeActive, claudeActive, codexActive, storedCredentials, detectProviders, detectProviderSources } from "../src/agent/hostdetect.js";
import { dispatchCall } from "../src/server.js";

const dirs = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "ape-hostdetect-"));
  dirs.push(d);
  return d;
}
function cleanup() { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }

function makeOpencodeHome() {
  const home = tempDir();
  const db = new DatabaseSync(join(home, "opencode.db"));
  db.exec("CREATE TABLE session (id TEXT PRIMARY KEY, model TEXT, time_updated INTEGER)");
  db.prepare("INSERT INTO session (id, model, time_updated) VALUES (?, ?, ?)")
    .run("ses_active", JSON.stringify({ id: "deepseek-ai/DeepSeek-V4-Flash-0731", providerID: "nebius", variant: "max" }), 1789696129928);
  db.prepare("INSERT INTO session (id, model, time_updated) VALUES (?, ?, ?)")
    .run("ses_old", "groq/llama-3.3-70b-versatile", 1000);
  db.close();
  writeFileSync(join(home, "auth.json"), JSON.stringify({
    nebius: { type: "api", key: "sk-nebius-test" },
    groq: { type: "api", key: "sk-groq-test" },
    openrouter: { type: "api", key: "sk-or-test" },
  }));
  return home;
}

test("hostdetect: opencode active detection reads newest session (provider + model + key)", async () => {
  const prev = process.env.OPENCODE_HOME;
  process.env.OPENCODE_HOME = makeOpencodeHome();
  try {
    const r = await opencodeActive();
    assert.equal(r.provider, "nebius");
    assert.equal(r.model, "deepseek-ai/DeepSeek-V4-Flash-0731");
    assert.equal(r.key, "sk-nebius-test");
    assert.equal(r.kind, "active");
    assert.equal(r.source, "opencode session");
  } finally { if (prev) process.env.OPENCODE_HOME = prev; else delete process.env.OPENCODE_HOME; }
});

test("hostdetect: claude active detection (OAuth token + model)", () => {
  const prev = process.env.APE_CLAUDE_HOME;
  const home = tempDir();
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "oauth-token-test" } }));
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ model: "claude-sonnet-4-6" }));
  process.env.APE_CLAUDE_HOME = home;
  try {
    const r = claudeActive();
    assert.equal(r.provider, "anthropic");
    assert.equal(r.model, "claude-sonnet-4-6");
    assert.equal(r.key, "oauth-token-test");
  } finally { if (prev) process.env.APE_CLAUDE_HOME = prev; else delete process.env.APE_CLAUDE_HOME; }
});

test("hostdetect: codex active detection (config model + token)", () => {
  const prev = process.env.CODEX_HOME;
  const home = tempDir();
  writeFileSync(join(home, "config.toml"), "model = \"gpt-4.1\"\n");
  writeFileSync(join(home, "auth.json"), JSON.stringify({ OPENAI_API_KEY: "sk-codex-test" }));
  process.env.CODEX_HOME = home;
  try {
    const r = codexActive();
    assert.equal(r.provider, "openai");
    assert.equal(r.model, "gpt-4.1");
    assert.equal(r.key, "sk-codex-test");
  } finally { if (prev) process.env.CODEX_HOME = prev; else delete process.env.CODEX_HOME; }
});

test("resolveModel: explicit provider wins over detection", async () => {
  const prevHome = process.env.OPENCODE_HOME;
  process.env.OPENCODE_HOME = makeOpencodeHome();
  const prev = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "sk-groq-env";
  try {
    const r = await resolveModel({ provider: "groq", id: "llama-3.3-70b-versatile" });
    assert.equal(r.provider, "groq");
    assert.equal(r.key, "sk-groq-env");
    assert.equal(r.resolution, "explicit");
  } finally {
    if (prevHome) process.env.OPENCODE_HOME = prevHome; else delete process.env.OPENCODE_HOME;
    if (prev) process.env.GROQ_API_KEY = prev; else delete process.env.GROQ_API_KEY;
  }
});

test("resolveModel: auto resolves the ACTIVE provider (nebius, not stored-first)", async () => {
  const prevHome = process.env.OPENCODE_HOME;
  process.env.OPENCODE_HOME = makeOpencodeHome(); // stores: nebius, groq, openrouter — active is nebius
  const prevProvider = process.env.APE_PROVIDER;
  delete process.env.APE_PROVIDER;
  try {
    const r = await resolveModel({ provider: "auto", id: "auto" });
    assert.equal(r.provider, "nebius", "active provider chosen, not first stored");
    assert.equal(r.id, "deepseek-ai/DeepSeek-V4-Flash-0731");
    assert.equal(r.key, "sk-nebius-test");
    assert.equal(r.resolution, "active");
  } finally {
    if (prevHome) process.env.OPENCODE_HOME = prevHome; else delete process.env.OPENCODE_HOME;
    if (prevProvider) process.env.APE_PROVIDER = prevProvider; else delete process.env.APE_PROVIDER;
  }
});

test("resolveModel: no provider anywhere → honest error with detected list", async () => {
  const saved = { home: process.env.OPENCODE_HOME, p: process.env.APE_PROVIDER, a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY, c: process.env.CODEX_HOME, cl: process.env.APE_CLAUDE_HOME, loc: process.env.APE_LOCAL_BASE_URL, noloc: process.env.APE_NO_LOCAL };
  delete process.env.APE_PROVIDER; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
  process.env.OPENCODE_HOME = tempDir();  // empty — not the real store
  process.env.CODEX_HOME = tempDir();
  process.env.APE_CLAUDE_HOME = tempDir();
  process.env.APE_LOCAL_BASE_URL = "http://127.0.0.1:9/v1"; // dead port — no local model
  process.env.APE_NO_LOCAL = "1"; // ignore any real localhost inference server
  try {
    const r = await resolveModel({ provider: "auto" });
    assert.ok(r.error, "returns error, not a silent guess");
    assert.ok(Array.isArray(r.detected));
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v) process.env[k] = v; else delete process.env[k]; }
  }
});

test("hostdetect: keys are read internally but never reach summaries/ledger fields", async () => {
  const prevHome = process.env.OPENCODE_HOME;
  process.env.OPENCODE_HOME = makeOpencodeHome();
  try {
    const stored = storedCredentials();
    assert.equal(stored.nebius, "sk-nebius-test");
    const summary = JSON.stringify(await detectProviders());
    assert.ok(!summary.includes("sk-"), "no key material in detection summary");
    const r = await resolveModel({ provider: "auto" });
    assert.equal(r.key, "sk-nebius-test", "resolver holds the key for the call (internal)");
    // The ledger/response surfaces only ever see provider + model + resolution.
    const publicSurfaces = JSON.stringify({
      model: r.provider + "/" + r.id,
      model_resolution: r.resolution,
      source: r.source,
      provider: r.provider,
    });
    assert.ok(!publicSurfaces.includes("sk-"), "no key material in ledger/response fields");
  } finally { if (prevHome) process.env.OPENCODE_HOME = prevHome; else delete process.env.OPENCODE_HOME; }
});

test("resolveModel: APE_PROVIDER/APE_MODEL env override active detection", async () => {
  const prevHome = process.env.OPENCODE_HOME;
  const prevP = process.env.APE_PROVIDER;
  const prevM = process.env.APE_MODEL;
  process.env.OPENCODE_HOME = makeOpencodeHome(); // active would be nebius
  process.env.APE_PROVIDER = "groq";
  process.env.APE_MODEL = "llama-3.3-70b-versatile";
  const prevKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "sk-groq-env-override";
  try {
    const r = await resolveModel({ provider: "auto", id: "auto" });
    assert.equal(r.provider, "groq", "env override wins over active detection");
    assert.equal(r.id, "llama-3.3-70b-versatile");
    assert.equal(r.key, "sk-groq-env-override");
  } finally {
    if (prevHome) process.env.OPENCODE_HOME = prevHome; else delete process.env.OPENCODE_HOME;
    if (prevP) process.env.APE_PROVIDER = prevP; else delete process.env.APE_PROVIDER;
    if (prevM) process.env.APE_MODEL = prevM; else delete process.env.APE_MODEL;
    if (prevKey) process.env.GROQ_API_KEY = prevKey; else delete process.env.GROQ_API_KEY;
  }
});

test("hostdetect: ape_status active_provider never leaks key material", async () => {
  const prevHome = process.env.OPENCODE_HOME;
  process.env.OPENCODE_HOME = makeOpencodeHome();
  try {
    const { dispatchCall } = await import("../src/server.js");
    const s = await dispatchCall("ape_status", {});
    const json = JSON.stringify(s.structuredContent.result);
    assert.ok(json.includes("nebius"), "active provider surfaced");
    assert.ok(!json.includes("sk-"), "no key material in ape_status output");
    assert.equal(s.structuredContent.result.active_provider.key, undefined);
  } finally { if (prevHome) process.env.OPENCODE_HOME = prevHome; else delete process.env.OPENCODE_HOME; }
});

test("hostdetect: opencode provider resolves from host store with zen base URL", async () => {
  const prevHome = process.env.OPENCODE_HOME;
  const home = tempDir();
  writeFileSync(join(home, "auth.json"), JSON.stringify({ opencode: { type: "api", key: "sk-opencode-test" } }));
  process.env.OPENCODE_HOME = home;
  try {
    const { credentialFor } = await import("../src/agent/hostdetect.js");
    const cred = await credentialFor("opencode");
    assert.equal(cred.key, "sk-opencode-test");
    const r = await resolveModel({ provider: "opencode", id: "muse-spark-1.3-contributor-free" });
    assert.equal(r.provider, "opencode");
    assert.equal(r.resolution, "explicit");
  } finally { if (prevHome) process.env.OPENCODE_HOME = prevHome; else delete process.env.OPENCODE_HOME; }
});

test("userDefaults: TUI-pinned provider/model feed resolveModel below env", async () => {
  const prevData = process.env.APE_DATA_DIR;
  const prevProvider = process.env.APE_PROVIDER;
  const d = tempDir();
  process.env.APE_DATA_DIR = d;
  delete process.env.APE_PROVIDER;
  try {
    writeFileSync(join(d, "config.json"), JSON.stringify({ provider: "mock", model: "mock-model" }));
    const u = userDefaults();
    assert.equal(u.provider, "mock");
    assert.equal(u.model, "mock-model");
    const r = await resolveModel({ provider: "auto", id: "auto" });
    assert.equal(r.provider, "mock", "pinned file beats auto");
    // Env still beats the file.
    process.env.APE_PROVIDER = "mock";
    const r2 = await resolveModel({ provider: "auto", id: "auto" });
    assert.equal(r2.provider, "mock");
  } finally {
    if (prevData) process.env.APE_DATA_DIR = prevData; else delete process.env.APE_DATA_DIR;
    if (prevProvider) process.env.APE_PROVIDER = prevProvider; else delete process.env.APE_PROVIDER;
  }
});

test("userDefaults: garbage config is ignored, never throws", () => {
  const prevData = process.env.APE_DATA_DIR;
  const d = tempDir();
  process.env.APE_DATA_DIR = d;
  try {
    writeFileSync(join(d, "config.json"), "{not json");
    assert.deepEqual(userDefaults(), {});
  } finally {
    if (prevData) process.env.APE_DATA_DIR = prevData; else delete process.env.APE_DATA_DIR;
  }
});

test("resolveModel: pinned model never leaks into another provider", async () => {
  const prevData = process.env.APE_DATA_DIR;
  const d = tempDir();
  process.env.APE_DATA_DIR = d;
  try {
    writeFileSync(join(d, "config.json"), JSON.stringify({ provider: "openai", model: "gpt-4.1" }));
    // Explicit mock must resolve the mock default, not the pinned gpt-4.1.
    const r = await resolveModel({ provider: "auto", id: "auto" }, { provider: "mock" });
    assert.equal(r.provider, "mock");
    assert.equal(r.id, "mock-model", `pinned model leaked: ${r.id}`);
    assert.deepEqual(r.layers, { provider: "override", model: "auto" });
    // And the pin still wins when nothing overrides it.
    const r2 = await resolveModel({ provider: "auto", id: "auto" }, {});
    assert.equal(r2.provider, "openai");
    assert.equal(r2.layers.provider, "pin");
  } finally {
    if (prevData) process.env.APE_DATA_DIR = prevData; else delete process.env.APE_DATA_DIR;
  }
});

test("detectProviderSources: names and sources, never keys", async () => {
  const prevHome = process.env.OPENCODE_HOME;
  process.env.OPENCODE_HOME = makeOpencodeHome();
  try {
    const all = await detectProviderSources();
    assert.ok(all.length >= 1);
    for (const s of all) {
      assert.ok(typeof s.provider === "string");
      assert.ok(typeof s.source === "string");
      assert.ok(!("key" in s) && !("token" in s), "no key material");
    }
    assert.ok(all.some((s) => s.provider === "nebius" && s.source === "opencode session"));
    assert.equal(defaultModelFor("openai"), "gpt-4.1");
  } finally { if (prevHome) process.env.OPENCODE_HOME = prevHome; else delete process.env.OPENCODE_HOME; }
});

test("ape_test_provider: mock succeeds with latency + cost; bogus fails honestly", async () => {
  const ok = await dispatchCall("ape_test_provider", { provider: "mock" }, { headlessBypass: true });
  const r = ok.structuredContent.result;
  assert.equal(r.ok, true);
  assert.equal(r.provider, "mock");
  assert.ok(typeof r.latency_ms === "number");
  assert.ok(typeof r.cost_usd === "number");
  const bad = await dispatchCall("ape_test_provider", { provider: "nope-xyz" }, { headlessBypass: true });
  const b = bad.structuredContent.result;
  assert.equal(b.ok, false);
  assert.equal(b.error, "provider_unavailable");
});

test("redactSecrets: key echo from upstream never reaches display or trace", async () => {
  const { createServer } = await import("node:http");
  const { readFileSync } = await import("node:fs");
  const secret = "sk-testsecret123456";
  const server = createServer((req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: `invalid key ${secret} rejected` } }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const prevBase = process.env.OPENAI_BASE_URL;
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.OPENAI_API_KEY = secret;
  try {
    const out = await dispatchCall("ape_test_provider", { provider: "openai" }, { headlessBypass: true });
    const r = out.structuredContent.result;
    assert.equal(r.ok, false);
    assert.ok(!JSON.stringify(r).includes(secret), "message redacted");
    assert.ok(JSON.stringify(r).includes("[redacted]"), "marker present");
    // Trace file for this data dir must not contain it either.
    const trace = readFileSync(join(process.env.APE_DATA_DIR, "trace.ndjson"), "utf8");
    assert.ok(!trace.includes(secret), "trace redacted");
  } finally {
    if (prevBase) process.env.OPENAI_BASE_URL = prevBase; else delete process.env.OPENAI_BASE_URL;
    if (prevKey) process.env.OPENAI_API_KEY = prevKey; else delete process.env.OPENAI_API_KEY;
    server.close();
  }
});

test.after(cleanup);