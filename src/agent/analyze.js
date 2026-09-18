// Harness evolution from trajectories — analyze a profile's recent runs and propose
// concrete profile edits. This is how profiles improve from ledger evidence instead of
// guesswork: chronic max_steps → raise the ceiling; high unverified rate → enforce
// verification; repeated repetition_detected → review tools; high cost → tighten budget
// or cheaper model; frequent model_error → add a fallback provider.
//
// The analyzer never mutates profiles itself. It returns findings + exact patches the
// user applies (e.g. in the console Agent tab), keeping a human in the loop. It can
// optionally record a belief so the learning persists in ADAM.
import { recentRuns } from "../runs.js";
import { loadProfile } from "./profiles.js";
import { adamCall } from "../adam-client.js";

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function analyzeProfile(profileName, { window = 20 } = {}) {
  const profile = loadProfile(profileName);
  if (!profile) return { error: "profile_not_found", profile: profileName };
  const runs = recentRuns(profileName, window).filter((r) => r.status !== "running");
  if (!runs.length) {
    return { profile: profileName, runs: 0, findings: [], suggestions: [], note: "no finished runs in window" };
  }
  const n = runs.length;
  const byStop = {};
  for (const r of runs) byStop[r.stop_reason ?? "?"] = (byStop[r.stop_reason ?? "?"] ?? 0) + 1;
  const done = runs.filter((r) => r.status === "done").length;
  const costs = runs.map((r) => Number(r.total_cost ?? 0));
  const steps = runs.map((r) => Number(r.step_count ?? 0));
  const unverified = runs.filter((r) => r.unverified).length;
  const maxStepsHits = (byStop.max_steps ?? 0) + (byStop.max_wall_seconds ?? 0);
  const repetitions = byStop.repetition_detected ?? 0;
  const modelErrors = (byStop.model_error ?? 0) + (byStop.no_provider ?? 0);

  const findings = [];
  const suggestions = [];
  const limits = profile.limits ?? {};

  findings.push({ metric: "completion_rate", value: `${done}/${n}`, detail: "done runs over finished runs in window" });
  findings.push({ metric: "stop_reasons", value: byStop, detail: "terminal states observed" });
  findings.push({
    metric: "cost_per_task", value: { median_usd: Number(median(costs).toFixed(6)), median_steps: median(steps) },
    detail: "median cost and steps per finished run",
  });

  // Chronic budget ceiling → raise it (to p90 steps, at least +4).
  if (maxStepsHits >= Math.max(2, Math.ceil(n * 0.4))) {
    const sorted = [...steps].sort((a, b) => a - b);
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    const current = Number(limits.max_steps ?? 12);
    const proposed = Math.max(current + 4, p90 + 2);
    findings.push({ metric: "budget_ceiling", value: `${maxStepsHits}/${n} hit max_steps/wall`, detail: "loop routinely runs out of room" });
    suggestions.push({
      finding: "chronic max_steps",
      patch: { limits: { max_steps: proposed } },
      rationale: `raise max_steps ${current} -> ${proposed} (p90 steps ${p90})`,
    });
  }

  // High unverified rate → enforce verification.
  const unverifiedRate = unverified / n;
  if (unverified >= 2 && unverifiedRate >= 0.4 && (profile.policy?.verify_before_finish ?? "warn") !== "enforce") {
    findings.push({ metric: "unverified_rate", value: `${unverified}/${n}`, detail: "runs claiming outcomes without verification evidence" });
    suggestions.push({
      finding: "unverified outcomes",
      patch: { policy: { verify_before_finish: "enforce" } },
      rationale: "require verification evidence before finish is accepted",
    });
  }

  // Repeated looping → the model is stuck, not the budget.
  if (repetitions >= 2) {
    findings.push({ metric: "repetition_rate", value: `${repetitions}/${n}`, detail: "runs halted on identical repeated calls" });
    suggestions.push({
      finding: "repetition",
      patch: null,
      rationale: "review the profile system prompt and tool set — the model repeats instead of progressing; consider narrowing tools or adding worked examples to system",
    });
  }

  // Cost pressure → tighten budget or cheaper model.
  const medCost = median(costs);
  const maxUsd = Number(limits.max_usd ?? 0.5);
  if (medCost >= maxUsd * 0.8 && n >= 3) {
    findings.push({ metric: "cost_pressure", value: `median $${medCost.toFixed(4)} vs max $${maxUsd}`, detail: "typical run nears the per-run ceiling" });
    suggestions.push({
      finding: "cost pressure",
      patch: null,
      rationale: "either raise max_usd (if outcomes justify it) or switch to a cheaper model id for routine objectives",
    });
  }

  // Provider failures → add a fallback.
  if (modelErrors >= 2 && !profile.model?.fallback) {
    findings.push({ metric: "provider_failures", value: `${modelErrors}/${n}`, detail: "runs dying on model/provider errors" });
    suggestions.push({
      finding: "provider fragility",
      patch: { model: { fallback: { provider: "openrouter", id: "anthropic/claude-sonnet-4-6" } } },
      rationale: "add a fallback provider so one outage does not kill runs",
    });
  }

  return { profile: profileName, runs: n, findings, suggestions };
}

export async function recordAnalysis(profileName, analysis, organismId = "default") {
  try {
    const summary = `harness analysis ${profileName}: ${analysis.runs} runs, ` +
      analysis.findings.map((f) => `${f.metric}=${typeof f.value === "object" ? JSON.stringify(f.value) : f.value}`).join("; ");
    const r = await adamCall("adam_beliefs", { statement: summary, origin: "observation" }, organismId);
    return r._adam === "ok";
  } catch { return false; }
}