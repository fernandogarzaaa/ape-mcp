import test from "node:test";
import assert from "node:assert/strict";
// H2: run import is a trust boundary. Step caps, numeric validation,
// lineage-cap enforcement, checkpoint shape checks, outcome scrubbing,
// signature-verifier semantics. Bundles are unsigned by design (trusted
// input); everything else about them is validated.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-import-"));
process.env.APE_MAX_RESUMES = "3";
process.env.APE_MAX_CONCURRENT_RUNS = "32";
process.env.APE_MAX_DAILY_USD = "1000000";
import { admitRun, importRun, getRun, loadCheckpoint, updateRun, verifyBundleSignature, EXPORT_BUNDLE_VERSION } from "../src/runs.js";
import { dispatchCall } from "../src/server.js";

const SECRET = "sk-test-IMPORTBOUNDARY00112233";
function baseBundle(over = {}) {
  const src = admitRun({ profile: "repo-triage", model: "mock-model", objective: "src" });
  // Source rows are fixtures, not live runs: stop them so the admission cap
  // (direct admitRun defaults) is never the thing under test here.
  if (!src.error) updateRun(src.run_id, { status: "stopped", stop_reason: "fixture", finished_at: new Date().toISOString() });
  return {
    version: EXPORT_BUNDLE_VERSION,
    run: { run_id: src.run_id, resumes: 0, step_count: 2, total_tokens: 10, total_cost: 0.01, outcome: "fine" },
    steps: [
      { step: 0, kind: "tool", tool: "probe", result_summary: "ok" },
      { step: 1, kind: "model", result_summary: "done" },
    ],
    checkpoint: { step: 1, state: { messages: [{ role: "user", content: "hi" }], budget: { steps: 1, tokens: 10, usd: 0.01, started: 123 }, destructiveUsed: 0 } },
    receipt: {},
    manifest: { signed: false, alg: null, signature: null },
    ...over,
  };
}

test("import: oversized step list is rejected, not planted", () => {
  const steps = [];
  for (let i = 0; i < 2500; i++) steps.push({ step: i, kind: "tool", tool: "x", result_summary: "s" });
  const out = importRun(baseBundle({ steps }));
  assert.equal(out.error, "import_too_large", JSON.stringify(out).slice(0, 160));
  assert.ok(out.max > 0, "cap reported");
});

test("import: negative and absurd counters rejected per field", () => {
  for (const patch of [
    { run: { resumes: -100 } },
    { run: { step_count: -1 } },
    { run: { total_tokens: 1e18 } },
    { run: { total_cost: -0.5 } },
    { checkpoint: { step: -5, state: {} } },
    { checkpoint: { step: 1, state: { budget: { steps: 1, tokens: -3, usd: 0 } } } },
    { checkpoint: { step: 1, state: { budget: { steps: 1, tokens: 1, usd: 0 }, destructiveUsed: -1 } } },
    { checkpoint: { step: 1, state: { messages: "not-an-array" } } },
    { checkpoint: { step: 1, state: { messages: [{ noRole: true }] } } },
  ]) {
    const b = baseBundle();
    if (patch.run) b.run = { ...b.run, ...patch.run };
    if (patch.checkpoint) b.checkpoint = { ...b.checkpoint, ...patch.checkpoint };
    const out = importRun(b);
    assert.ok(out.error === "invalid_bundle" || out.error === "resume_cap_reached", `rejected ${JSON.stringify(patch).slice(0, 80)}: ${JSON.stringify(out).slice(0, 120)}`);
    assert.ok(out.field || out.error === "resume_cap_reached", "field named");
  }
});

test("import: lineage resume cap enforced (import counts as a resume)", () => {
  const b = baseBundle();
  b.run.resumes = 3;
  const out = importRun(b);
  assert.equal(out.error, "resume_cap_reached", JSON.stringify(out).slice(0, 160));
  assert.equal(out.max, 3);
});

test("import: claimed-but-unverifiable signature is rejected", () => {
  const b = baseBundle();
  b.manifest = { signed: true, alg: "hmac-sha256", signature: "deadbeef" };
  const v = verifyBundleSignature(b);
  assert.equal(v.signed, false);
  assert.ok(v.reject, "unverifiable claim rejected, not trusted");
  const out = importRun(b);
  assert.equal(out.error, "unverifiable_signature");
});

test("import: unsigned manifest is trusted input (documented, explicit)", () => {
  const v = verifyBundleSignature(baseBundle());
  assert.equal(v.signed, false);
  assert.ok(!v.reject, "unsigned accepted by the verifier as trusted input");
});

test("import: valid bundle imports, scrubs outcome, plants resumable checkpoint", () => {  const b = baseBundle();
  b.run.outcome = `all good, key was ${SECRET} ok`;
  b.steps[0].result_summary = `used ${SECRET} fine`;
  const out = importRun(b);
  assert.ok(!out.error, JSON.stringify(out).slice(0, 200));
  assert.equal(out.status, "stopped");
  assert.equal(out.resume_count, 1, "lineage continues");
  const row = getRun(out.run_id);
  assert.ok(!JSON.stringify(row).includes(SECRET), "no raw secret anywhere in the planted row");
  assert.ok(row.outcome.includes("[redacted]"), "outcome scrubbed at import");
  assert.ok(row.steps[0].result_summary.includes("[redacted]"), "step summary scrubbed at import");
  assert.equal(row.parent_run_id, b.run.run_id, "lineage linked");
  const cp = loadCheckpoint(out.run_id);
  assert.ok(cp && cp.step === 1, "checkpoint planted");
  assert.deepEqual(cp.state.budget, { steps: 1, tokens: 10, usd: 0.01, started: 123 }, "checkpoint state intact");
  assert.equal(row.status, "stopped", "imported run resumable-shaped");
});

test("import: resume from an imported checkpoint runs to completion", async () => {
  const dir = join(process.env.APE_DATA_DIR, "profiles");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "del-import-mock.yaml"), [
    "name: del-import-mock",
    "description: hermetic resume target",
    "model: { provider: mock, id: mock-model }",
    "system: test",
    "tools:",
    "  - builtin: finish",
    "limits: { max_steps: 5, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0 }",
    "",
  ].join("\n"));
  const b = baseBundle();
  b.run.profile = "del-import-mock";
  const out = importRun(b);
  assert.ok(!out.error, JSON.stringify(out).slice(0, 200));
  const resumed = await dispatchCall("ape_agent_resume", { run_id: out.run_id });
  assert.equal(resumed.structuredContent.result.status, "running", `resume accepted: ${JSON.stringify(resumed.structuredContent.result).slice(0, 160)}`);
  let fin = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    fin = getRun(out.run_id);
    if (fin.status !== "running") break;
  }
  assert.equal(fin.status, "done", `imported checkpoint completed: ${fin.status} / ${fin.stop_reason}`);
}, 60000);
