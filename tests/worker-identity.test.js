import test from "node:test";
import assert from "node:assert/strict";
// M7: run control must only ever affect the worker belonging to that run.
// Handles are exact; bare PIDs are never signaled (recycled PIDs belong to
// strangers). Stale-but-pinging rows are reaped by step freshness.
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-workerid-"));
import { dispatchCall } from "../src/server.js";
import { admitRun, getRun, updateRun, reconcileRuns } from "../src/runs.js";

function sleeper() {
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000);"], { stdio: "ignore" });
  return child;
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test("identity: cancel refuses to signal a live PID it holds no handle for", async () => {
  const keep = sleeper();
  try {
    assert.ok(alive(keep.pid), "sleeper running");
    const adm = admitRun({ profile: "repo-triage", model: "mock-model", objective: "foreign pid" });
    assert.ok(!adm.error);
    // No worker was ever forked for this row in this process: no handle.
    updateRun(adm.run_id, { worker_pid: keep.pid });
    const out = await dispatchCall("ape_agent_cancel", { run_id: adm.run_id });
    const r = out.structuredContent.result;
    assert.equal(r.error, "cancel_refused_no_handle", `refused honestly: ${JSON.stringify(r).slice(0, 200)}`);
    assert.ok(alive(keep.pid), "stranger process NOT signaled");
    assert.equal(getRun(adm.run_id).status, "running", "row untouched");
  } finally {
    try { keep.kill("SIGKILL"); } catch { /* gone */ }
  }
});

test("identity: cancel with a dead PID marks the run without signaling", async () => {
  const adm = admitRun({ profile: "repo-triage", model: "mock-model", objective: "dead pid" });
  assert.ok(!adm.error);
  updateRun(adm.run_id, { worker_pid: 2147483647 });
  const out = await dispatchCall("ape_agent_cancel", { run_id: adm.run_id });
  const r = out.structuredContent.result;
  assert.ok(!r.error, `no error: ${JSON.stringify(r).slice(0, 160)}`);
  assert.equal(getRun(adm.run_id).status, "stopped", "dead-pid row marked stopped");
});

test("identity: reconcile reaps pinging-but-stale rows, keeps fresh ones", async () => {
  const keep = sleeper();
  try {
    const stale = admitRun({ profile: "repo-triage", model: "mock-model", objective: "stale" });
    updateRun(stale.run_id, {
      worker_pid: keep.pid,
      started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    });
    const fresh = admitRun({ profile: "repo-triage", model: "mock-model", objective: "fresh" });
    updateRun(fresh.run_id, { worker_pid: keep.pid });
    const r = reconcileRuns({ graceMs: 1000 });
    assert.ok(r.fixed >= 1, "stale fixed");
    assert.equal(getRun(stale.run_id).stop_reason, "worker_gone", "stale stepless row reaped despite live PID");
    assert.equal(getRun(fresh.run_id).status, "running", "fresh row untouched");
    updateRun(fresh.run_id, { status: "stopped", stop_reason: "test-cleanup", finished_at: new Date().toISOString() });
  } finally {
    try { keep.kill("SIGKILL"); } catch { /* gone */ }
  }
});

test("identity: cancel with a live handle still stops the run", async () => {
  const prev = process.env.APE_MOCK_STEP_DELAY_MS;
  process.env.APE_MOCK_STEP_DELAY_MS = "400";
  try {
    const script = [
      { tool: "finish", args: { summary: "never reached" } },
      { tool: "finish", args: { summary: "never reached" } },
      { tool: "finish", args: { summary: "never reached" } },
      { tool: "finish", args: { summary: "never reached" } },
      { tool: "finish", args: { summary: "reached only if cancel failed" } },
    ];
    const started = await dispatchCall(
      "ape_agent_run",
      { profile: "repo-triage", objective: "cancel me", _mockScript: script },
      { headlessBypass: true }
    );
    const runId = started.structuredContent.result.run_id;
    assert.ok(runId);
    await new Promise((r) => setTimeout(r, 300));
    const out = await dispatchCall("ape_agent_cancel", { run_id: runId });
    const r = out.structuredContent.result;
    assert.ok(!r.error, `handle cancel clean: ${JSON.stringify(r).slice(0, 160)}`);
    for (let i = 0; i < 30; i++) {
      await new Promise((rr) => setTimeout(rr, 250));
      const st = getRun(runId);
      if (st.status !== "running") break;
    }
    const fin = getRun(runId);
    assert.equal(fin.status, "stopped", `run stopped, got ${fin.status}`);
  } finally {
    if (prev === undefined) delete process.env.APE_MOCK_STEP_DELAY_MS;
    else process.env.APE_MOCK_STEP_DELAY_MS = prev;
  }
});
