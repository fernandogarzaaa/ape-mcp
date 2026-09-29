import test from "node:test";
import assert from "node:assert";
// Phase-2 hermetic tests: portable run export/import (ape_agent_export /
// ape_agent_import). Bundles are unsigned v1; import validates the version,
// requires a checkpoint, and plants the imported run as a NEW run_id with
// lineage linked (parent_run_id + resumes chain), resumable via ape_agent_resume.
// Same hermetic pattern as run-claims.test.js: $0 mock forks, one shared ledger.
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
// W-4: test-only mock-input flag (production servers strip _mockScript).
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { dispatchCall } from "../src/server.js";
import { createRun, updateRun, saveCheckpoint, loadCheckpoint, getRun, exportRun, importRun, EXPORT_BUNDLE_VERSION } from "../src/runs.js";

const R = (out) => out.structuredContent.result;
const now = () => new Date().toISOString();
// Unique marker so rows from other test files / earlier runs can't pollute assertions.
const tag = `exporttest-${process.pid}`;

function stopRun(id) {
  updateRun(id, { status: "stopped", stop_reason: "cancelled", finished_at: now() });
}

async function waitForSettled(id, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const g = await dispatchCall("ape_agent_status", { run_id: id });
    if (R(g).status !== "running") return R(g);
    await new Promise((x) => setTimeout(x, 250));
  }
  throw new Error(`run ${id} did not settle within ${timeoutMs}ms`);
}

test("export: bundle shape, unsigned manifest, unknown run errors", () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `export shape ${tag}` });
  try {
    stopRun(id);
    saveCheckpoint(id, 2, { messages: [{ role: "user", content: "hi" }], budget: { steps: 2, tokens: 5, usd: 0 }, usedModel: "mock-model" });
    const b = exportRun(id);
    assert.equal(b.version, EXPORT_BUNDLE_VERSION);
    assert.equal(b.version, 1);
    assert.ok(b.exported_at, "exported_at present");
    assert.equal(b.run.run_id, id);
    assert.ok(!("worker_pid" in b.run), "worker_pid is machine-local and stripped");
    assert.ok(Array.isArray(b.steps), "steps array present");
    assert.ok(b.checkpoint && typeof b.checkpoint.state === "object", "checkpoint state present");
    assert.equal(b.checkpoint.step, 2);
    assert.deepEqual(b.manifest.signed, false, "v1 bundles are unsigned, stated plainly");
    assert.ok(String(b.manifest.exporter).startsWith("ape-mcp/"), "exporter identified");

    // Unknown run -> honest error.
    const missing = exportRun("run-does-not-exist");
    assert.equal(missing.error, "run_not_found");
  } finally {
    stopRun(id);
  }
});

test("import: rejects bad versions, missing checkpoints, malformed bundles", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `import reject ${tag}` });
  try {
    stopRun(id);
    saveCheckpoint(id, 1, { messages: [], budget: { steps: 1, tokens: 1, usd: 0 } });
    const good = exportRun(id);

    const badVersion = importRun({ ...good, version: 999 });
    assert.equal(badVersion.error, "unsupported_bundle_version");
    assert.equal(badVersion.bundle_version, 999);
    assert.equal(badVersion.supported_version, 1);

    const noCp = importRun({ ...good, checkpoint: null });
    assert.equal(noCp.error, "no_checkpoint");
    assert.equal(noCp.source_run_id, id);

    assert.equal(importRun(null).error, "invalid_bundle");
    assert.equal(importRun([]).error, "invalid_bundle");
    assert.equal(importRun({ version: 1 }).error, "invalid_bundle", "bundle without run row");
    assert.equal(importRun({ version: 1, run: {}, checkpoint: { state: {} } }).error, "invalid_bundle");

    // Malformed JSON string via the tool arg -> honest error, not a crash.
    const badJson = R(await dispatchCall("ape_agent_import", { bundle: "{not json" }));
    assert.equal(badJson.error, "invalid_bundle");
  } finally {
    stopRun(id);
  }
});

test("export/import: round trip links lineage and plants a resumable checkpoint", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `round trip ${tag}` });
  try {
    stopRun(id);
    saveCheckpoint(id, 4, {
      messages: [{ role: "user", content: "continue this" }, { role: "assistant", content: "working" }],
      budget: { steps: 4, tokens: 40, usd: 0.01 },
      usedModel: "mock-model",
      evidences: [{ tool: "finish", step: 3 }],
    });
    // A couple of step rows so the history copy is exercised.
    const { appendStep } = await import("../src/runs.js");
    appendStep(id, { step: 1, kind: "tool", tool: "memory.recall", resultSummary: "recalled x" });
    appendStep(id, { step: 2, kind: "tool", tool: "genesis.audit_claim", resultSummary: "sound" });

    const bundle = R(await dispatchCall("ape_agent_export", { run_id: id }));
    assert.equal(bundle.version, 1);
    assert.equal(bundle.steps.length, 2, "step history travels in the bundle");

    // Bundle may also arrive as a JSON string (hosts that stringify args).
    const imported = R(await dispatchCall("ape_agent_import", { bundle: JSON.stringify(bundle) }));
    assert.ok(!imported.error, "import succeeded: " + JSON.stringify(imported).slice(0, 200));
    assert.ok(imported.run_id && imported.run_id !== id, "import mints a NEW run_id");
    assert.equal(imported.uri, `ape://runs/${imported.run_id}`);
    assert.equal(imported.parent_run_id, id, "lineage linked to the exported run");
    assert.equal(imported.source_run_id, id);
    assert.equal(imported.resume_count, 1, "resumes chain extended (0 -> 1)");
    assert.equal(imported.steps_imported, 2);
    assert.equal(imported.checkpoint_step, 4);
    assert.equal(imported.status, "stopped");
    assert.equal(imported.stop_reason, "imported");

    const row = getRun(imported.run_id);
    assert.equal(row.parent_run_id, id);
    assert.equal(row.steps.length, 2, "step history copied with run_id remapped");
    assert.ok(row.steps.every((s) => s.run_id === imported.run_id));
    assert.equal(row.steps[0].tool, "memory.recall");
    assert.equal(row.claimant, null, "imported runs start unclaimed");

    const cp = loadCheckpoint(imported.run_id);
    assert.ok(cp && cp.state, "checkpoint planted on the imported run");
    assert.equal(cp.step, 4);
    assert.deepEqual(cp.state.messages[0], { role: "user", content: "continue this" });

    // The imported run resumes from the planted checkpoint via the normal path.
    const resumed = R(await dispatchCall("ape_agent_resume", {
      run_id: imported.run_id, _mockScript: [{ tool: "finish", args: { summary: "imported resumed done" } }],
    }, { headlessBypass: true }));
    assert.equal(resumed.status, "running");
    assert.equal(resumed.resumed_from_step, 4, "resume continues from the exported checkpoint");
    const settled = await waitForSettled(imported.run_id);
    assert.ok(["done", "failed", "stopped"].includes(settled.status), "imported run settled: " + settled.status);
    const after = getRun(imported.run_id);
    assert.ok((after.resume_count ?? 0) >= 2, "resume_count kept climbing: " + after.resume_count);
  } finally {
    stopRun(id);
  }
});

test("export/import: live source exports with a divergence warning", () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `live warn ${tag}` });
  try {
    // Deliberately NOT stopped: the run is live. Export is read-only and
    // allowed, but the import must warn about divergent resume.
    saveCheckpoint(id, 1, { messages: [], budget: { steps: 1, tokens: 1, usd: 0 } });
    const bundle = exportRun(id);
    assert.ok(!bundle.error);
    const imported = importRun(bundle);
    assert.ok(!imported.error);
    assert.ok(imported.warning && imported.warning.includes("diverge"), "live-source warning present: " + imported.warning);
    stopRun(imported.run_id);
  } finally {
    stopRun(id);
  }
});

test("export/import: URIs accepted; extension methods reachable", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `uri export ${tag}` });
  try {
    stopRun(id);
    saveCheckpoint(id, 1, { messages: [{ role: "user", content: "x" }], budget: { steps: 1, tokens: 1, usd: 0 } });
    const viaUri = R(await dispatchCall("ape_agent_export", { run_id: `ape://runs/${id}` }));
    assert.equal(viaUri.run.run_id, id, "ape:// URI accepted by export");
    const { agentMethod } = await import("../src/server.js");
    const viaExt = await agentMethod("agent/export", { run_id: id });
    assert.equal(viaExt.run.run_id, id, "agent/export extension method works");
    const back = await agentMethod("agent/import", { bundle: viaExt });
    assert.ok(back.run_id && back.run_id !== id, "agent/import extension method works");
    stopRun(back.run_id);
  } finally {
    stopRun(id);
  }
});
