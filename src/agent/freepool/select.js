// Candidate selection: expand pool members into (provider, model, key)
// candidates, drop the ones that cannot serve (cooldown, limits, context,
// tool support), and score the rest per strategy.
//
// Score = weighted reliability / speed / capability / headroom, times a
// headroom guardrail that demotes (never excludes) a key near its ceiling.
// Deterministic on purpose (no Thompson sampling): routing must be
// reproducible from the ledger, and tests must be exact.
import * as L from "./ledger.js";

export const STRATEGIES = {
  auto: { rel: 0.35, speed: 0.2, cap: 0.3, head: 0.15 },
  fast: { rel: 0.25, speed: 0.55, cap: 0.05, head: 0.15 },
  smart: { rel: 0.25, speed: 0.05, cap: 0.6, head: 0.1 },
  // cost: ordering is cost-first (see costroute.js); the weights only break
  // ties among equally cheap candidates.
  cost: { rel: 0.4, speed: 0.2, cap: 0.2, head: 0.2 },
};

export function estimateTokens({ system = "", messages = [], tools = [] } = {}) {
  let chars = String(system ?? "").length;
  for (const m of messages ?? []) {
    chars += String(m?.content ?? "").length;
    if (m?.toolCalls?.length) chars += JSON.stringify(m.toolCalls).length;
  }
  if (tools?.length) chars += JSON.stringify(tools).length;
  return Math.ceil(chars / 4);
}

function headroomOf(used, limits, estTokens) {
  // Returns { ok, headroom, blocked } where headroom is 1 - worst used fraction.
  let worst = 0;
  const checks = [["rpm", used.rpm + 1], ["rpd", used.rpd + 1], ["tpm", used.tpm + estTokens], ["tpd", used.tpd + estTokens]];
  for (const [k, next] of checks) {
    const lim = limits[k];
    if (lim == null || !(lim > 0)) continue;
    if (next > lim) return { ok: false, headroom: 0, blocked: k };
    worst = Math.max(worst, (next - (k.startsWith("t") ? estTokens : 1)) / lim);
  }
  return { ok: true, headroom: Math.max(0, 1 - worst), blocked: null };
}

export function scoreCandidate(c, weights) {
  const rel = (c.health.successes + 1) / (c.health.successes + c.health.failures + 2);
  const catalogSpeed = Math.min(3, Math.max(1, Number(c.speed ?? 2))) / 3;
  const observed = c.health.latencyMs == null ? null : Math.max(0, Math.min(1, 1 - c.health.latencyMs / 20000));
  const speed = observed == null ? catalogSpeed : 0.5 * catalogSpeed + 0.5 * observed;
  const cap = Math.min(4, Math.max(1, Number(c.tier ?? 2))) / 4;
  const head = c.headroom;
  const base = weights.rel * rel + weights.speed * speed + weights.cap * cap + weights.head * head;
  const guard = head < 0.2 ? 0.5 + head * 2.5 : 1;
  return Number((base * guard).toFixed(6));
}

// members: from poolMembers(). opts: { strategy, needTools, toolCount,
// estTokens, pin, exclude:Set<candidateId> }.
// Returns { candidates (sorted best-first), skipped:[{id, reason}] }.
export function buildCandidates(members, opts = {}) {
  const weights = STRATEGIES[opts.strategy] ?? STRATEGIES.auto;
  const est = Number(opts.estTokens ?? 0);
  const exclude = opts.exclude ?? new Set();
  const candidates = [];
  const skipped = [];
  for (const mem of members) {
    for (const model of mem.models) {
      const target = `${mem.provider}/${model.id}`;
      if (opts.pin && !target.startsWith(opts.pin)) continue;
      if (opts.needTools && !model.tools) { skipped.push({ id: target, reason: "no tool support" }); continue; }
      if (model.context && est > model.context) { skipped.push({ id: target, reason: `context ${model.context} < estimated ${est}` }); continue; }
      mem.keys.forEach((key, slot) => {
        const kh = L.keyHash(key);
        const id = `${target}#${slot}`;
        if (exclude.has(id)) { skipped.push({ id, reason: "already tried this request" }); return; }
        const cd = L.cooldown(mem.provider, model.id, kh);
        if (cd) { skipped.push({ id, reason: `cooldown (${cd.reason ?? "?"}) until ${new Date(cd.until).toISOString()}` }); return; }
        const limits = L.effectiveLimits(mem.provider, model.id, kh, model.limits);
        const used = L.usage(mem.provider, model.id, kh);
        const hr = headroomOf(used, limits, est);
        if (!hr.ok) { skipped.push({ id, reason: `${hr.blocked} limit reached` }); return; }
        let headroom = hr.headroom;
        const acct = mem.account_limits ?? {};
        if (acct.rpm || acct.rpd || acct.tpm || acct.tpd) {
          const au = L.usage(mem.provider, "*", kh);
          const ah = headroomOf(au, acct, est);
          if (!ah.ok) { skipped.push({ id, reason: `account ${ah.blocked} limit reached` }); return; }
          headroom = Math.min(headroom, ah.headroom);
        }
        const c = {
          id,
          target,
          provider: mem.provider,
          model: model.id,
          slot,
          key,
          keyHash: kh,
          baseUrl: mem.baseUrl,
          local: !!mem.local,
          free: true,
          tier: model.tier ?? 2,
          speed: model.speed ?? 2,
          context: model.context ?? null,
          tools: !!model.tools,
          limitsHeader: mem.limits_header_requests ?? "minute",
          limits,
          used,
          headroom,
          health: L.health(mem.provider, model.id, kh),
        };
        candidates.push(c);
      });
    }
  }
  // Reliability/latency are judged per MODEL (pooled across its keys), and
  // headroom per KEY: keys of one model then compete on headroom alone, which
  // rotates traffic to the least-used key instead of rewarding whichever key
  // happened to serve first.
  const agg = new Map();
  for (const c of candidates) {
    const a = agg.get(c.target) ?? { successes: 0, failures: 0, lat: [], };
    a.successes += c.health.successes;
    a.failures += c.health.failures;
    if (c.health.latencyMs != null) a.lat.push(c.health.latencyMs);
    agg.set(c.target, a);
  }
  for (const c of candidates) {
    const a = agg.get(c.target);
    const pooled = { successes: a.successes, failures: a.failures, latencyMs: a.lat.length ? Math.round(a.lat.reduce((x, y) => x + y, 0) / a.lat.length) : null };
    c.score = scoreCandidate({ ...c, health: pooled }, weights);
  }
  candidates.sort((a, b) => b.score - a.score || a.used.rpd - b.used.rpd || a.id.localeCompare(b.id));
  return { candidates, skipped };
}
