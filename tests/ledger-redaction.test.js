import test from "node:test";
import assert from "node:assert";
// H1+M3: credential-shaped provider/tool output must not cross the
// persistence/display boundary in raw form. Boundaries covered: trace
// entries, ledger step rows (live + imported), run outcome via a real mock
// run, status reads, evidence excerpts. Secrets below are synthetic and
// never logged; assertions check their absence, not their presence.
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-redact-"));
import { redactSecrets, emitTrace, tracePath } from "../src/trace.js";
import { readFileSync } from "node:fs";
import { admitRun, recordStep, getRun, importRun } from "../src/runs.js";
import { dispatchCall } from "../src/server.js";
import { buildEvidence } from "../src/agent/evidence.js";

const SECRETS = {
  openai: "sk-test-ABCD1234EFGH5678",
  anthropic: "sk-ant-test-0123456789abcdef",
  bearer: "Bearer abcdefghijklmnopqrstuz",
  bearerLower: "bearer abcdefghijklmnopqrstuz",
  password: "password=hunter2-fake",
  passwd: "passwd: s3cr3t-fake",
  refresh: "refresh_token=RT-fake-1234567890",
  akia: "AKIAIOSFODNN7EXAMPLE",
  pem: "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgYJKoZIhvcNAQcBoIIBKASCAQAwggEKAoIBAQKCAQEA\n-----END RSA PRIVATE KEY-----",
  query: "https://api.example.com/v1?api_key=qk-fake-9999&x=1",
  xai: "xai-fakeKey1234567890",
  groq: "gsk_fakeGroqKey123456789012345",
  apikey: 'api_key: "qk-fake-assign-1"',
};

test("redact: every secret class is scrubbed, shape preserved around it", () => {
  for (const [name, s] of Object.entries(SECRETS)) {
    const out = redactSecrets(`prefix ${s} suffix`);
    assert.ok(!out.includes(s), `${name} raw value absent`);
    assert.ok(out.includes("prefix") && out.includes("suffix"), `${name} surrounding text intact`);
    assert.ok(out.includes("[redacted]"), `${name} marker present`);
  }
});

test("redact: benign prose is untouched (no assignment, no token shape)", () => {
  const benign = [
    "the bearer of bad news arrived",
    "use your password manager for safety",
    "token ring topology was popular in the 90s",
    "secret santa assignments go out friday",
  ];
  for (const b of benign) assert.equal(redactSecrets(b), b, `untouched: ${b}`);
});

test("ledger: live step summaries persist scrubbed, read scrubbed", () => {
  const adm = admitRun({ profile: "repo-triage", model: "mock-model", objective: "redact probe" });
  assert.ok(!adm.error);
  const hostile = `provider error using key ${SECRETS.openai} and ${SECRETS.bearer} pw ${SECRETS.password}`;
  recordStep(adm.run_id, { step: 1, kind: "tool", tool: "probe", resultSummary: hostile });
  const row = getRun(adm.run_id);
  const stored = row.steps[row.steps.length - 1].result_summary;
  for (const s of [SECRETS.openai, SECRETS.bearer, "hunter2-fake"]) assert.ok(!stored.includes(s), "raw absent from row");
  assert.ok(stored.includes("[redacted]"), "marker present in row");
});

test("ledger: imported step history persists scrubbed", () => {
  const src = admitRun({ profile: "repo-triage", model: "mock-model", objective: "src" });
  const out = importRun({
    version: 1,
    run: { run_id: src.run_id, resumes: 0 },
    steps: [{ step: 0, kind: "tool", tool: "probe", result_summary: `leaked ${SECRETS.akia} plus ${SECRETS.query}` }],
    checkpoint: { step: 0, state: {} },
  });
  assert.ok(!out.error, JSON.stringify(out).slice(0, 160));
  const row = getRun(out.run_id);
  const stored = row.steps[row.steps.length - 1].result_summary;
  assert.ok(stored.includes("[redacted]"), "imported summary scrubbed");
  assert.ok(!stored.includes(SECRETS.akia) && !stored.includes("qk-fake-9999"), "imported row clean");
});

test("ledger: trace entries scrub summaries", () => {
  emitTrace({ tool: "probe-test", resultSummary: `token ${SECRETS.groq} here` });
  const lines = readFileSync(tracePath(), "utf8").trim().split("\n");
  const hit = lines.map((l) => { try { return JSON.parse(l); } catch { return {}; } })
    .find((e) => e.tool === "probe-test");
  assert.ok(hit, "trace entry present");
  assert.ok(!hit.resultSummary.includes(SECRETS.groq), "trace summary clean");
});

test("ledger: evidence excerpts scrub credential shapes", () => {
  const ev = buildEvidence({ tool: "probe", fullText: `result ok, key=${SECRETS.xai} done`, step: 1 });
  assert.ok(!JSON.stringify(ev).includes(SECRETS.xai), "evidence clean");
  assert.ok(ev.digest && ev.digest.startsWith("sha256:"), "digest intact");
});

test("ledger: mock-run outcome persists scrubbed end to end", async () => {
  const script = [{ tool: "finish", args: { summary: `done, used ${SECRETS.openai} successfully` } }];
  const started = await dispatchCall(
    "ape_agent_run",
    { profile: "repo-triage", objective: "redact e2e", _mockScript: script },
    { headlessBypass: true }
  );
  const runId = started.structuredContent.result.run_id;
  assert.ok(runId);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const st = await dispatchCall("ape_agent_status", { run_id: runId });
    if (st.structuredContent.result.status !== "running") break;
  }
  const fin = await dispatchCall("ape_agent_status", { run_id: runId });
  assert.equal(fin.structuredContent.result.status, "done");
  assert.ok(fin.structuredContent.result.outcome, "completed outcome present");
  const flat = JSON.stringify(fin.structuredContent.result);
  assert.ok(!flat.includes(SECRETS.openai), "outcome clean through status read path");
});

test("redact: quoted credentials including commas and escaped quotes are fully scrubbed at persistence boundaries", () => {
  const json = JSON.stringify({ password: 'first,second "third"', api_key: "json-api-value", token: "json-token-value" });
  assert.deepEqual(JSON.parse(redactSecrets(json)), { password: "[redacted]", api_key: "[redacted]", token: "[redacted]" });
  const assignments = `password="first,second third" passphrase=value secret='one,two three' token=plain`;
  assert.equal(redactSecrets(assignments), `password="[redacted]" passphrase=[redacted] secret='[redacted]' token=[redacted]`);
  const adm = admitRun({ profile: "repo-triage", model: "mock-model", objective: "quoted redaction" });
  assert.ok(!adm.error);
  recordStep(adm.run_id, { step: 1, kind: "tool", tool: "quoted", resultSummary: json });
  assert.equal(getRun(adm.run_id).steps[0].result_summary, redactSecrets(json));
  emitTrace({ tool: "quoted", resultSummary: json });
  const hit = readFileSync(tracePath(), "utf8").trim().split("\n").map(JSON.parse).find((entry) => entry.tool === "quoted");
  assert.equal(hit.resultSummary, redactSecrets(json));
});
