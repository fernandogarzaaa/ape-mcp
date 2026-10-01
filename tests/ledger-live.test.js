import test from "node:test";
import assert from "node:assert";
// Live ledger semantics: mid-run row totals, denied reasons, cancel marker.
// Forked mock workers with a step delay so polls land mid-run deterministically.
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
process.env.APE_MOCK_STEP_DELAY_MS ??= "1200";
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchCall } from "../src/server.js";

process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-ledger-live-"));

async function startRun(objective, mockScript) {
  const r = await dispatchCall(
    "ape_agent_run",
    { profile: "repo-triage", objective, _mockScript: mockScript },
    { headlessBypass: true }
  );
  const runId = r.structuredContent.result.run_id;
  assert.ok(runId, "run started");
  return runId;
}

async function statusOf(runId) {
  const g = await dispatchCall("ape_agent_status", { run_id: runId });
  return g.structuredContent.result;
}

async function waitFor(runId, pred, tries = 80) {
  let st = null;
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 250));
    st = await statusOf(runId);
    if (pred(st)) return st;
  }
  return st;
}

test("ledger: mid-run row totals equal the step aggregation", async () => {
  const script = [
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "finish", args: { summary: "totals" } },
  ];
  const runId = await startRun("totals probe", script);
  const mid = await waitFor(runId, (s) => s.status === "running" && (s.steps?.length ?? 0) >= 2);
  assert.equal(mid.status, "running", "caught mid-run");
  assert.ok((mid.steps?.length ?? 0) >= 2, "ledger rows streaming");
  const agg = { cost: 0, tokens: 0, turns: 0 };
  for (const s of mid.steps) {
    agg.cost += s.cost ?? 0;
    agg.tokens += s.tokens ?? 0;
    if (s.kind === "model") agg.turns++;
  }
  assert.ok(Math.abs(mid.total_cost - agg.cost) < 1e-9, `cost live: row=${mid.total_cost} agg=${agg.cost}`);
  assert.equal(mid.total_tokens, agg.tokens, "tokens live");
  assert.equal(mid.step_count, agg.turns, "model turns live");
  // And the terminal absolute write agrees with the same aggregation.
  const done = await waitFor(runId, (s) => s.status !== "running");
  assert.equal(done.status, "done");
  let dcost = 0;
  for (const s of done.steps) dcost += s.cost ?? 0;
  assert.ok(Math.abs(done.total_cost - dcost) < 1e-9, "terminal write consistent");
});

test("ledger: cancel appends an interruption marker, totals untouched", async () => {
  const script = [
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "finish", args: { summary: "cancelled" } },
  ];
  const runId = await startRun("cancel probe", script);
  await waitFor(runId, (s) => s.status === "running" && (s.steps?.length ?? 0) >= 1);
  const c = await dispatchCall("ape_agent_cancel", { run_id: runId });
  assert.equal(c.structuredContent.result.status, "stopped");
  const after = await statusOf(runId);
  const marker = (after.steps ?? []).find((s) => s.kind === "cancel");
  assert.ok(marker, "marker row present");
  assert.match(String(marker.result_summary ?? marker.resultSummary), /interrupted:cancelled/, "honest wording");
  assert.equal(marker.cost ?? 0, 0, "zero-value row");
  assert.equal(marker.tokens ?? 0, 0, "zero-value row");
  // No marker when cancelling a finished run.
  const doneId = await startRun("finished probe", [{ tool: "finish", args: { summary: "x" } }]);
  await waitFor(doneId, (s) => s.status !== "running");
  const c2 = await dispatchCall("ape_agent_cancel", { run_id: doneId });
  assert.match(c2.structuredContent.result.note ?? "", /already finished/);
  const after2 = await statusOf(doneId);
  assert.ok(!(after2.steps ?? []).some((s) => s.kind === "cancel"), "no marker on finished run");
});

test("ledger: ape_ledger reads the audit stream with limit + kind filter", async () => {
  const { appendFileSync, existsSync } = await import("node:fs");
  const p = join(process.env.APE_DATA_DIR, "ledger.jsonl");
  if (!existsSync(p)) appendFileSync(p, "");
  appendFileSync(p, JSON.stringify({ kind: "agent.destructive", tool: "x", verdict: "denied" }) + "\n");
  appendFileSync(p, JSON.stringify({ kind: "genesis.audit", suite: "code", verdict: "SOUND" }) + "\n");
  const all = await dispatchCall("ape_ledger", {});
  assert.ok((all.structuredContent.result.entries?.length ?? 0) >= 2, "entries listed");
  const filt = await dispatchCall("ape_ledger", { kind: "genesis", limit: 1 });
  const r = filt.structuredContent.result;
  assert.equal(r.entries.length, 1, "limit honored");
  assert.ok(String(r.entries[0].kind).includes("genesis"), "kind filter honored");
  const cut = await dispatchCall("ape_ledger", { limit: 1 });
  assert.equal(cut.structuredContent.result.truncated, true, "truncation reported honestly");
});

test("ledger: ape_ledger caps limit at 200 and stays read-only", async () => {  const { appendFileSync } = await import("node:fs");
  const p = join(process.env.APE_DATA_DIR, "ledger.jsonl");
  for (let i = 0; i < 210; i++) {
    appendFileSync(p, JSON.stringify({ kind: "cap.probe", i }) + "\n");
  }
  const r = await dispatchCall("ape_ledger", { limit: 500 });
  assert.equal(r.structuredContent.result.returned, 200, "capped at 200");
  assert.equal(r.structuredContent.result.truncated, true);
  // Read-only: the file still holds every line we wrote.
  const { readFileSync } = await import("node:fs");
  assert.ok(readFileSync(p, "utf8").split("\n").filter(Boolean).length >= 210, "nothing removed");
});

test("ledger: destructive-denied step rows carry the reason", async () => {
  // The loop deny path needs adam.evolve as a declared engine tool with a
  // deny policy (same shape as agent.test.js's audit test).
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(process.env.APE_DATA_DIR, "profiles"), { recursive: true });
  writeFileSync(
    join(process.env.APE_DATA_DIR, "profiles", "deny-probe.yaml"),
    [
      "name: deny-probe",
      "model:",
      "  provider: mock",
      "  id: mock-model",
      "system: probe",
      "tools:",
      "  - engine: adam.evolve",
      "  - builtin: finish",
      "limits:",
      "  max_steps: 5",
      "  max_tokens: 100000",
      "  max_wall_seconds: 60",
      "  max_usd: 1.0",
      "policy:",
      "  destructive: deny",
      "",
    ].join("\n")
  );
  const script = [
    { tool: "adam.evolve", args: { action: "accept", proposal_id: "p1" } },
    { tool: "finish", args: { summary: "denied probe" } },
  ];
  const r = await dispatchCall(
    "ape_agent_run",
    { profile: "deny-probe", objective: "denied probe", _mockScript: script },
    { headlessBypass: true }
  );
  const runId = r.structuredContent.result.run_id;
  assert.ok(runId, "run started");
  const done = await waitFor(runId, (s) => s.status !== "running");
  const denied = (done.steps ?? []).find((s) => String((s.result_summary ?? s.resultSummary)).startsWith("destructive:"));
  assert.ok(denied, "denied step recorded");
  assert.match(
    String(denied.result_summary ?? denied.resultSummary),
    /denies unattended destructive calls/,
    "human reason in the row, not just the marker"
  );
});

test("prune: only finished-and-old logs inside .ape/workers/ are removed", async () => {
  const fs = await import("node:fs");
  const { pruneWorkerLogs } = await import("../src/runs.js");
  const dir = process.env.APE_DATA_DIR;
  const wdir = join(dir, "workers");
  fs.mkdirSync(wdir, { recursive: true });
  const old = Date.now() - 20 * 86400000;
  const fresh = Date.now();
  const backdate = (p, t) => fs.utimesSync(p, new Date(t), new Date(t));

  // Finished run, old log -> removed.
  const doneId = await startRun("prune-done", [{ tool: "finish", args: { summary: "x" } }]);
  await waitFor(doneId, (s) => s.status !== "running");
  // Live run, old log -> kept.
  const liveId = await startRun("prune-live", [
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "finish", args: { summary: "x" } },
  ]);
  await waitFor(liveId, (s) => s.status === "running" && (s.steps?.length ?? 0) >= 1);
  const doneLog = join(wdir, `${doneId}.log`);
  const liveLog = join(wdir, `${liveId}.log`);
  fs.writeFileSync(doneLog, "done worker output\n");
  fs.writeFileSync(liveLog, "live worker output\n");
  backdate(doneLog, old);
  backdate(liveLog, old);
  // Fresh finished log -> kept.
  const freshLog = join(wdir, "run-fresh.log");
  fs.writeFileSync(freshLog, "fresh\n");
  backdate(freshLog, fresh);
  // Decoys OUTSIDE workers/: must all survive.
  const decoys = [
    join(dir, "run-decoy.log"),
    join(dir, "profiles", "decoy.log"),
    join(wdir, "nested", "deep.log"),
  ];
  fs.mkdirSync(join(dir, "profiles"), { recursive: true });
  fs.mkdirSync(join(wdir, "nested"), { recursive: true });
  for (const d of decoys) {
    fs.writeFileSync(d, "decoy\n");
    backdate(d, old);
  }

  const r = pruneWorkerLogs({ maxAgeDays: 14 });
  assert.deepEqual(r.removed, [`${doneId}.log`], "exactly the old finished log");
  assert.ok(!fs.existsSync(doneLog), "removed from disk");
  assert.ok(fs.existsSync(liveLog), "live run log kept");
  assert.ok(fs.existsSync(freshLog), "fresh log kept");
  for (const d of decoys) assert.ok(fs.existsSync(d), `outside scope survives: ${d}`);
  assert.ok(fs.existsSync(join(wdir, "nested")), "subdirectory untouched");

  // Dry run removes nothing.
  const r2 = pruneWorkerLogs({ maxAgeDays: 14, dryRun: true });
  assert.ok(!fs.existsSync(doneLog), "already gone stays gone");
  assert.ok(r2.removed.length === 0 || fs.existsSync(join(wdir, r2.removed[0])), "dry run deletes nothing");
  await dispatchCall("ape_agent_cancel", { run_id: liveId });
});
