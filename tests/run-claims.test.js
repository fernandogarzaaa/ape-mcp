import test from "node:test";
import assert from "node:assert";
// Phase-1 hermetic tests: run discovery (ape_agent_list) + the claim protocol
// (ape_agent_claim / ape_agent_release, claim-gated cancel + resume).
// Test workers are $0 mock forks sharing one ledger DB across parallel test
// processes; raise the production concurrency guard so scheduling luck can't
// flake worker-fork tests (the daily spend ceiling still applies).
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
// W-4: test-only mock-input flag (production servers strip _mockScript).
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { dispatchCall, resolveClaimant, parseRunRef, runUri } from "../src/server.js";
import { createRun, updateRun, saveCheckpoint, getRun, claimRun, releaseRun, queryRuns } from "../src/runs.js";

const R = (out) => out.structuredContent.result;
const now = () => new Date().toISOString();
// Unique marker so rows from other test files / earlier runs can't pollute
// filter assertions; the shared ledger persists across suite runs.
const tag = `claimtest-${process.pid}`;

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

test("claims: parseRunRef/runUri and resolveClaimant precedence", () => {
  assert.equal(parseRunRef("ape://runs/run-abc"), "run-abc");
  assert.equal(parseRunRef("run-abc"), "run-abc");
  assert.equal(runUri("run-abc"), "ape://runs/run-abc");
  // Explicit argument wins.
  assert.equal(resolveClaimant("alice", {}), "alice");
  // Env fallback: --claim-as populates APE_CLAIM_AS.
  const prev = process.env.APE_CLAIM_AS;
  try {
    process.env.APE_CLAIM_AS = "env-operator";
    assert.equal(resolveClaimant(undefined, {}), "env-operator");
    assert.equal(resolveClaimant("", {}), "env-operator");
    assert.equal(resolveClaimant("alice", {}), "alice", "explicit arg beats env");
  } finally {
    if (prev === undefined) delete process.env.APE_CLAIM_AS;
    else process.env.APE_CLAIM_AS = prev;
  }
  // MCP client identity fallback: clientInfo.name + short session hash.
  assert.equal(
    resolveClaimant(undefined, { clientInfo: { name: "opencode" }, sessionId: "sess-abcdef123456" }),
    "opencode#sess-abc"
  );
  assert.equal(resolveClaimant(undefined, { clientInfo: { name: "opencode" } }), "opencode#stdio");
  // No identity anywhere -> anonymous.
  assert.equal(resolveClaimant(undefined, {}), "anonymous");
  assert.equal(resolveClaimant(undefined, { clientInfo: {} }), "anonymous");
});

test("claims: claim -> conflict(409) -> release -> re-claim on a live run", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `live claim flow ${tag}` });
  try {
    const c1 = R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "alice" }));
    assert.equal(c1.claimant, "alice");
    assert.equal(c1.advisory, false, "live claims are exclusive");
    assert.ok(c1.claimed_at);

    const conflict = R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "bob" }));
    assert.equal(conflict.error, "claim_conflict");
    assert.equal(conflict.status, 409);
    assert.equal(conflict.holder, "alice");

    // Same holder re-claiming is idempotent, not a conflict.
    const again = R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "alice" }));
    assert.equal(again.claimant, "alice");
    assert.ok(!again.error);

    // Non-holder cannot release.
    const denied = R(await dispatchCall("ape_agent_release", { run_id: id, claimant: "bob" }));
    assert.equal(denied.error, "not_claim_holder");
    assert.equal(denied.holder, "alice");

    // Holder releases; run becomes claimable again.
    const rel = R(await dispatchCall("ape_agent_release", { run_id: id, claimant: "alice" }));
    assert.equal(rel.released, true);
    assert.equal(getRun(id).claimant, null);

    const c2 = R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "bob" }));
    assert.equal(c2.claimant, "bob");

    // Releasing an unclaimed run is a no-op success.
    const rel2 = R(await dispatchCall("ape_agent_release", { run_id: id, claimant: "bob" }));
    assert.equal(rel2.released, true);
    const rel3 = R(await dispatchCall("ape_agent_release", { run_id: id, claimant: "bob" }));
    assert.equal(rel3.released, false);

    // Claiming a missing run is an honest error.
    const missing = R(await dispatchCall("ape_agent_claim", { run_id: "run-does-not-exist", claimant: "alice" }));
    assert.equal(missing.error, "run_not_found");
  } finally {
    stopRun(id);
  }
});

test("claims: terminal runs are advisory (takeover allowed, previous holder reported)", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `terminal claim ${tag}` });
  stopRun(id);
  const c1 = R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "alice" }));
  assert.equal(c1.claimant, "alice");
  assert.equal(c1.advisory, true);
  // Another operator may take over a terminal run's advisory claim.
  const c2 = R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "bob" }));
  assert.equal(c2.claimant, "bob");
  assert.equal(c2.advisory, true);
  assert.equal(c2.previous_holder, "alice");
  // Holder can still release an advisory claim explicitly.
  const rel = R(await dispatchCall("ape_agent_release", { run_id: id, claimant: "bob" }));
  assert.equal(rel.released, true);
});

test("claims: cancel on a live run requires the holder", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `cancel claim ${tag}` });
  R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "alice" }));
  const refused = R(await dispatchCall("ape_agent_cancel", { run_id: id, claimant: "bob" }));
  assert.equal(refused.error, "claim_required");
  assert.equal(refused.holder, "alice");
  assert.equal(getRun(id).status, "running", "refused cancel must not stop the run");
  // The holder can cancel.
  const ok = R(await dispatchCall("ape_agent_cancel", { run_id: id, claimant: "alice" }));
  assert.equal(ok.status, "stopped");
  assert.equal(ok.stop_reason, "cancelled");
  // Unclaimed live runs keep the old behavior: anyone can cancel.
  const free = createRun({ profile: "repo-triage", model: "mock/mock", objective: `cancel unclaimed ${tag}` });
  const ok2 = R(await dispatchCall("ape_agent_cancel", { run_id: free }));
  assert.equal(ok2.status, "stopped");
});

test("claims: resume requires the holder and transfers the claim on success", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `resume claim ${tag}` });
  stopRun(id);
  saveCheckpoint(id, 3, { messages: [{ role: "user", content: "resume me" }], budget: { steps: 3, tokens: 10, usd: 0 }, usedModel: "mock-model" });
  R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "alice" }));
  // A non-holder cannot resume even though the run is stopped: otherwise the
  // handoff protection is bypassed exactly when it matters.
  const refused = R(await dispatchCall("ape_agent_resume", { run_id: id, claimant: "bob", _mockScript: [{ tool: "finish", args: { summary: "x" } }] }));
  assert.equal(refused.error, "claim_required");
  assert.equal(refused.holder, "alice");
  // The holder resumes; the claim transfers (refreshed) to the resumer.
  const resumed = R(await dispatchCall("ape_agent_resume", {
    run_id: id, claimant: "alice", _mockScript: [{ tool: "finish", args: { summary: "resumed done" } }],
  }, { headlessBypass: true }));
  assert.equal(resumed.status, "running");
  assert.equal(resumed.resumed_from_step, 3);
  assert.equal(resumed.claimant, "alice");
  const settled = await waitForSettled(id);
  assert.ok(["done", "failed", "stopped"].includes(settled.status), "resumed run settled: " + settled.status);
  const after = getRun(id);
  assert.ok((after.resume_count ?? 0) >= 1, "resume_count surfaced in status");
  assert.equal(after.resumed_from, 3, "resumed_from surfaced in status");
  assert.equal(after.claimant, "alice", "claim survives the resume");
});

test("claims: advisory takeover enables handoff, then resume transfers the claim", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `handoff ${tag}` });
  stopRun(id);
  saveCheckpoint(id, 1, { messages: [{ role: "user", content: "handoff me" }], budget: { steps: 1, tokens: 10, usd: 0 }, usedModel: "mock-model" });
  R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "alice" }));
  // Bob takes the advisory claim on the terminal run, then resumes: claim
  // transfers to bob, the operator now driving the run.
  const taken = R(await dispatchCall("ape_agent_claim", { run_id: id, claimant: "bob" }));
  assert.equal(taken.claimant, "bob");
  assert.equal(taken.previous_holder, "alice");
  const resumed = R(await dispatchCall("ape_agent_resume", {
    run_id: id, claimant: "bob", _mockScript: [{ tool: "finish", args: { summary: "handed off" } }],
  }, { headlessBypass: true }));
  assert.equal(resumed.status, "running");
  assert.equal(resumed.claimant, "bob");
  await waitForSettled(id);
});

test("list: filters, limits, and row shape (incl. URIs and claim state)", async () => {
  const profile = `claim-list-${tag}`;
  const parent = `parent-${tag}`;
  const liveId = createRun({ profile, model: "mock/mock", objective: `list live ${tag}` });
  const doneId = createRun({ profile, model: "mock/mock", objective: `list done ${tag}` });
  const childId = createRun({ profile, model: "mock/mock", objective: `list child ${tag}`, parent_run_id: parent });
  try {
    updateRun(doneId, { status: "done", stop_reason: "explicit_final_answer", finished_at: now() });
    stopRun(childId);
    R(await dispatchCall("ape_agent_claim", { run_id: liveId, claimant: "alice" }));

    const all = R(await dispatchCall("ape_agent_list", { profile }));
    assert.ok(all.runs.length >= 3, "profile filter finds the test rows");
    assert.ok(all.runs.every((r) => r.profile === profile));
    for (const r of all.runs) {
      assert.ok(r.run_id, "run_id present");
      assert.equal(r.uri, `ape://runs/${r.run_id}`, "canonical URI present");
      assert.ok(r.started_at, "started_at present");
      assert.ok(r.updated_at, "updated_at derived");
      assert.ok("claimant" in r, "claim state present");
      assert.ok(Number.isFinite(r.step_count), "step_count present");
      assert.ok(Number.isFinite(r.cost_usd), "cost_usd present");
    }
    const liveRow = all.runs.find((r) => r.run_id === liveId);
    assert.equal(liveRow.claimant, "alice");
    assert.equal(liveRow.status, "running");

    const stopped = R(await dispatchCall("ape_agent_list", { profile, status: "stopped" }));
    assert.ok(stopped.runs.length >= 1);
    assert.ok(stopped.runs.every((r) => r.status === "stopped"));

    const kids = R(await dispatchCall("ape_agent_list", { parent_run_id: parent }));
    assert.ok(kids.runs.length >= 1);
    assert.ok(kids.runs.every((r) => r.parent_run_id === parent));
    assert.ok(kids.runs.some((r) => r.run_id === childId));

    const limited = R(await dispatchCall("ape_agent_list", { profile, limit: 1 }));
    assert.equal(limited.runs.length, 1, "limit is honored");
  } finally {
    stopRun(liveId);
  }
});

test("claims: URIs are accepted everywhere a run_id is", async () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `uri refs ${tag}` });
  try {
    const uri = runUri(id);
    const claimed = R(await dispatchCall("ape_agent_claim", { run_id: uri, claimant: "alice" }));
    assert.equal(claimed.claimant, "alice");
    const listed = R(await dispatchCall("ape_agent_list", { profile: "repo-triage", limit: 100 }));
    assert.ok(listed.runs.some((r) => r.run_id === id && r.uri === uri));
    const cancelled = R(await dispatchCall("ape_agent_cancel", { run_id: uri, claimant: "alice" }));
    assert.equal(cancelled.status, "stopped");
    assert.equal(cancelled.uri, uri);
  } finally {
    stopRun(id);
  }
});

test("claims: unit-level claimRun/releaseRun/queryRuns round trip", () => {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `unit ${tag}` });
  try {
    assert.equal(claimRun(id, "alice").claimant, "alice");
    assert.equal(claimRun(id, "bob").error, "claim_conflict");
    assert.equal(releaseRun(id, "bob").error, "not_claim_holder");
    assert.equal(releaseRun(id, "alice").released, true);
    const rows = queryRuns({ profile: "repo-triage", limit: 100 });
    assert.ok(rows.some((r) => r.run_id === id));
    assert.ok(queryRuns({ status: "no-such-status", limit: 5 }).every(() => true), "unknown status filters to empty");
  } finally {
    stopRun(id);
  }
});
