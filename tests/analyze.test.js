import test from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { analyzeProfile } from "../src/agent/analyze.js";
import { createRun, updateRun } from "../src/runs.js";
import { dispatchCall } from "../src/server.js";
import { dataDir } from "../src/trace.js";

function makeProfile(name) {
  const dir = join(dataDir(), "profiles");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.yaml`), [
    `name: ${name}`,
    "description: test profile",
    "model:",
    "  provider: mock",
    "  id: mock-model",
    "system: test",
    "tools:",
    "  - builtin: finish",
    "limits:",
    "  max_steps: 12",
    "  max_tokens: 100000",
    "  max_wall_seconds: 60",
    "  max_usd: 1.0",
  ].join("\n"));
}
function dropProfile(name) {
  try { rmSync(join(dataDir(), "profiles", `${name}.yaml`), { force: true }); } catch { /* ignore */ }
}

function seedRuns(profile, specs) {
  const ids = [];
  for (const s of specs) {
    const id = createRun({ profile, model: "mock/mock", objective: "seed", organism_id: "test" });
    updateRun(id, {
      status: s.status ?? "done",
      stop_reason: s.stop_reason ?? "explicit_final_answer",
      step_count: s.steps ?? 5,
      total_tokens: 100,
      total_cost: s.cost ?? 0.01,
      unverified: s.unverified ? 1 : 0,
      finished_at: new Date().toISOString(),
    });
    ids.push(id);
  }
  return ids;
}
// Unique profile per test run: runs.db persists across suites, so fixed names
// would see stale history from prior runs.
function uniq(base) {
  return `${base}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

test("analyze: unknown profile errors honestly", () => {
  const r = analyzeProfile("no-such-profile-xyz");
  assert.equal(r.error, "profile_not_found");
});

test("analyze: chronic max_steps suggests raising the ceiling", () => {
  const name = uniq("analyze-maxsteps");
  makeProfile(name);
  try {
    seedRuns(name, [
      { stop_reason: "max_steps", steps: 12, cost: 0.05 },
      { stop_reason: "max_steps", steps: 12, cost: 0.05 },
      { stop_reason: "max_steps", steps: 12, cost: 0.05 },
      { stop_reason: "explicit_final_answer", steps: 4, cost: 0.01 },
    ]);
    const r = analyzeProfile(name, { window: 10 });
    assert.equal(r.runs, 4);
    const s = r.suggestions.find((x) => x.finding === "chronic max_steps");
    assert.ok(s, "max_steps suggestion present");
    assert.ok(s.patch.limits.max_steps > 12, "proposes a higher ceiling");
  } finally { dropProfile(name); }
});

test("analyze: high unverified rate suggests enforce", () => {
  const name = uniq("analyze-unverified");
  makeProfile(name);
  try {
    seedRuns(name, [
      { stop_reason: "explicit_final_answer", unverified: true },
      { stop_reason: "explicit_final_answer", unverified: true },
      { stop_reason: "explicit_final_answer", unverified: false },
    ]);
    const r = analyzeProfile(name, { window: 10 });
    const s = r.suggestions.find((x) => x.finding === "unverified outcomes");
    assert.ok(s, "enforce suggestion present");
    assert.equal(s.patch.policy.verify_before_finish, "enforce");
  } finally { dropProfile(name); }
});

test("analyze: healthy history yields no alarmist patches", () => {
  const name = uniq("analyze-healthy");
  makeProfile(name);
  try {
    seedRuns(name, [
      { stop_reason: "explicit_final_answer", steps: 3, cost: 0.005 },
      { stop_reason: "explicit_final_answer", steps: 4, cost: 0.006 },
      { stop_reason: "explicit_final_answer", steps: 3, cost: 0.005 },
    ]);
    const r = analyzeProfile(name, { window: 10 });
    assert.equal(r.suggestions.length, 0, "no suggestions for a healthy profile");
    assert.ok(r.findings.some((f) => f.metric === "completion_rate"));
  } finally { dropProfile(name); }
});

test("analyze: MCP tool surface works end to end", async () => {
  const name = uniq("analyze-healthy");
  makeProfile(name);
  try {
    seedRuns(name, [{ stop_reason: "explicit_final_answer", steps: 3, cost: 0.005 }]);
    const r = await dispatchCall("ape_agent_analyze", { profile: name, window: 10 });
    assert.equal(r.resultType, "complete");
    assert.equal(r.structuredContent.result.profile, name);
    assert.ok(Array.isArray(r.structuredContent.result.findings));
    const bad = await dispatchCall("ape_agent_analyze", { profile: "nope" });
    assert.equal(bad.structuredContent.result.error, "profile_not_found");
  } finally { dropProfile(name); }
});