// Outcome identity: stable family IDs, dedup lookup, cost-per-outcome, deprecation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-outcomes-"));

const { familyOf, normalizeObjective } = await import("../src/agent/outcomes.js");
const runs = await import("../src/runs.js");
const { runAgent } = await import("../src/agent/loop.js");

test("outcomes: family is stable across case/punctuation, distinct across tasks", () => {
  assert.equal(familyOf("Triage flaky Windows tests!"), familyOf("triage flaky windows tests"));
  assert.notEqual(familyOf("triage flaky windows tests"), familyOf("bake chocolate cake"));
  assert.ok(familyOf("x").startsWith("fam-"));
  assert.equal(normalizeObjective("Resume run-id run-abc123def456 now"), "resume now");
});

test("outcomes: dedup finds recent same-family completions only", () => {
  const fam = familyOf("dedup probe objective");
  const id = runs.createRun({ profile: "p", model: "m", objective: "dedup probe objective", outcome_family: fam });
  runs.updateRun(id, { status: "done", stop_reason: "explicit_final_answer", outcome_hash: "abc123", total_cost: 0.01, finished_at: new Date().toISOString() });
  const hit = runs.findDuplicate({ family: fam, windowSec: 3600 });
  assert.equal(hit?.run_id, id);
  assert.equal(runs.findDuplicate({ family: fam, windowSec: 0 }), null, "window 0 disables");
  assert.equal(runs.findDuplicate({ family: fam, organism_id: "other", windowSec: 3600 }), null, "organism scoped");
  assert.equal(runs.findDuplicate({ family: fam, windowSec: 3600, excludeRunId: id }), null, "self excluded");
  assert.equal(runs.findDuplicate({ family: "fam-nonexistent", windowSec: 3600 }), null, "unknown family");
});

test("outcomes: familyStats aggregates cost-per-outcome + variants + deprecation", () => {
  const fam = familyOf("stats probe objective");
  const a = runs.createRun({ profile: "p", model: "m", objective: "stats probe objective", outcome_family: fam });
  runs.updateRun(a, { status: "done", stop_reason: "explicit_final_answer", step_count: 4, total_cost: 0.02, outcome_hash: "v1", finished_at: new Date().toISOString() });
  const b = runs.createRun({ profile: "p", model: "m", objective: "stats probe objective", outcome_family: fam });
  runs.updateRun(b, { status: "done", stop_reason: "explicit_final_answer", step_count: 6, total_cost: 0.04, outcome_hash: "v2", finished_at: new Date().toISOString() });
  let s = runs.familyStats(fam);
  assert.equal(s.completed, 2);
  assert.equal(s.total_cost_usd, 0.06);
  assert.equal(s.avg_cost_usd, 0.03);
  assert.equal(s.avg_steps, 5);
  assert.equal(s.variants.length, 2);
  runs.deprecateVariant({ family: fam, outcome_hash: "v1", reason: "superseded by v2" });
  s = runs.familyStats(fam);
  assert.ok(s.variants.find((v) => v.outcome_hash === "v1")?.deprecated, "v1 flagged");
  assert.ok(!s.variants.find((v) => v.outcome_hash === "v2")?.deprecated, "v2 live");
  assert.equal(s.deprecated[0]?.reason, "superseded by v2");
});

test("outcomes: run receipt carries the family id", async () => {
  const res = await runAgent({
    profile: {
      name: "t", model: { provider: "mock", id: "mock-model" }, tools: [{ builtin: "finish" }],
      limits: { max_steps: 5, max_tokens: 100000, max_wall_seconds: 60, max_usd: 1.0 },
      policy: { verify_before_finish: "off" },
    },
    objective: "Family Receipt Check!",
    mockScript: [{ tool: "finish", args: { summary: "done" } }],
  });
  assert.equal(res.receipt.family, familyOf("Family Receipt Check!"));
});
