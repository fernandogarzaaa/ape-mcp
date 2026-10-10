// Cost-aware routing ("cost" strategy): for each model call, pick the
// cheapest candidate that is likely sufficient.
//
//   ladder:  local (free)  ->  freepool free tiers ($0)  ->  paid providers
//   gate:    candidate capability tier >= required tier
//   tier:    from classifyObjective (router.js) + request signals
//            (tools required, context size, prior failures in this run)
//   escalate one tier on quality failures (error 4xx, empty/invalid output,
//   tool-call parse failure); availability failures (429/5xx/timeout) fail
//   over at the SAME tier first and escalate only once that tier is exhausted.
//   paid:    only when no free candidate meets the tier, and only while the
//            estimated call cost fits the run's remaining budget
//            (limits.max_usd and credential_policy.max_spend_usd[provider]).
//
// The tier classifier is pluggable (registerTierClassifier) so a learned
// router — e.g. a small fine-tuned classifier like the costroute project's
// LoRA MiniLM router — can replace the keyword rules later without adding
// ML dependencies to APE itself.
import { classifyObjective } from "../router.js";

export const TIER_NAMES = { 1: "small", 2: "medium", 3: "large", 4: "frontier" };
export const CATEGORY_TIER = { trivial: 1, general: 2, coding: 3, reasoning: 3 };

let classifierHook = null;
// fn({ objective, messages, tools, estTokens, priorFailures }) ->
//   { tier: 1..4, category?, confidence?, reason? } | null (null = defer to rules).
// May be async. Throws are swallowed (rules win) — a broken plug-in must
// never take routing down.
export function registerTierClassifier(fn) { classifierHook = typeof fn === "function" ? fn : null; }
export function _tierClassifier() { return classifierHook; }

export function objectiveFrom(messages) {
  const first = (messages ?? []).find((m) => m?.role === "user");
  return String(first?.content ?? "");
}

const clampTier = (t) => Math.min(4, Math.max(1, Math.round(Number(t) || 2)));

// Rule-based required tier. Signals:
//   tools present        -> at least tier 2 (reliable tool calling)
//   estTokens > 32k      -> at least tier 3 (long-context reasoning)
//   priorFailures >= 2   -> +1 (this run has already shown weak answers)
export async function requiredTier({ objective = "", messages = [], tools = [], estTokens = 0, priorFailures = 0 } = {}) {
  const obj = objective || objectiveFrom(messages);
  const reasons = [];
  let source = "rules";
  let cls = classifyObjective(obj);
  let tier = CATEGORY_TIER[cls.category] ?? 2;
  reasons.push(`${cls.category} -> tier ${tier}`);
  if (classifierHook) {
    try {
      const r = await classifierHook({ objective: obj, messages, tools, estTokens, priorFailures });
      if (r && Number.isFinite(Number(r.tier))) {
        tier = clampTier(r.tier);
        source = "hook";
        if (r.category) cls = { ...cls, category: r.category, confidence: r.confidence ?? cls.confidence };
        reasons.push(`classifier hook -> tier ${tier}${r.reason ? ` (${r.reason})` : ""}`);
      }
    } catch { reasons.push("classifier hook failed; rules kept"); }
  }
  if (tools?.length && tier < 2) { tier = 2; reasons.push("tools required -> tier 2"); }
  if (estTokens > 32000 && tier < 3) { tier = 3; reasons.push(`~${estTokens} tokens -> tier 3`); }
  if (priorFailures >= 2 && tier < 4) { tier++; reasons.push(`${priorFailures} prior failures this run -> +1`); }
  return { tier: clampTier(tier), category: cls.category, confidence: cls.confidence ?? 0, source, reasons };
}

// Per-run memory (keyed by convKey): quality failures seen in earlier turns.
const runMemory = new Map();
export function priorFailuresFor(convKey) { return runMemory.get(convKey)?.failures ?? 0; }
export function notePriorFailure(convKey, n = 1) {
  if (!convKey) return;
  const cur = runMemory.get(convKey) ?? { failures: 0 };
  cur.failures += n;
  runMemory.set(convKey, cur);
  if (runMemory.size > 500) runMemory.delete(runMemory.keys().next().value);
}
export function _resetRunMemory() { runMemory.clear(); }

// Ladder rank: local < free < paid; within a rank, lowest sufficient tier
// first (saves bigger models' quota), then score.
export function costRank(c) { return c.local ? 0 : c.free ? 1 : 2; }
export function sortForCost(cands) {
  return [...cands].sort((a, b) =>
    costRank(a) - costRank(b)
    || (a.estCostUsd ?? 0) - (b.estCostUsd ?? 0)
    || a.tier - b.tier
    || (b.score ?? 0) - (a.score ?? 0)
    || a.id.localeCompare(b.id));
}

// Budget left for a paid candidate (USD). Infinity when unconstrained.
export function budgetLeftFor(provider, budget) {
  let left = Infinity;
  if (budget?.usdLeft != null && Number.isFinite(Number(budget.usdLeft))) left = Math.min(left, Number(budget.usdLeft));
  const cap = budget?.spendCaps?.[provider];
  if (cap != null && Number.isFinite(Number(cap))) left = Math.min(left, Number(cap) - Number(budget?.spentByProvider?.[provider] ?? 0));
  return left;
}
