// freepool provider: one logical model backed by stacked free LLM tiers.
// Clean-room JavaScript port of the core ideas of FreeLLMAPI
// (github.com/tashfeenahmed/freellmapi, MIT): pick the best healthy
// (provider, model, key) under its limits, fail over on 429/5xx/timeout with
// cooldowns, learn ceilings from 429s and headers. No code or runtime
// dependency on that project; the catalog is our own (catalog/freepool.json,
// refreshed by scripts/refresh-catalog.mjs).
//
// Calls go through the SAME openaiChat path every OpenAI-compatible provider
// uses (tool calls keep working); freepool only decides WHO serves. The
// serving upstream is returned as servedBy so the loop's receipt shows it.
import * as L from "./ledger.js";
import { poolMembers, loadCatalog, memberInventory, freepoolEgressHosts, PROVIDER_SPECS, EXCLUDED_PROVIDERS } from "./members.js";
import { buildCandidates, estimateTokens, STRATEGIES } from "./select.js";
import { parseRateHeaders, parseLimitFromBody, parseRetryAfter, classifyFailure, headerGetter } from "./ratelimits.js";
import { requiredTier, priorFailuresFor, notePriorFailure, sortForCost, budgetLeftFor, TIER_NAMES } from "./costroute.js";
import { redactSecrets } from "../../trace.js";

export { STRATEGIES, poolMembers, freepoolEgressHosts };
export const QUALITY_FAILURES = new Set(["bad_request", "invalid"]);
const ATTEMPT_CAP_MS = 60000;
const OUT_TOKENS_EST = 1024;
const NON_PAID = new Set(["mock", "local", "freepool"]);

export function parseFreepoolId(id) {
  const s = String(id ?? "auto");
  if (STRATEGIES[s]) return { strategy: s, pin: null };
  if (s.includes("/")) return { strategy: "auto", pin: s };
  return { strategy: "auto", pin: null };
}

export function hasMembers(opts = {}) { return poolMembers(opts).length > 0; }

export function toolNamesOf(tools) {
  return new Set((tools ?? []).map((t) => t?.function?.name ?? t?.name).filter(Boolean));
}

// Empty or malformed output counts as a failure so the pool can fail over /
// escalate instead of handing the loop garbage.
export function validateResponse(resp, toolNames = new Set()) {
  if (!resp) return "no response";
  for (const tc of resp.toolCalls ?? []) {
    if (!tc?.name) return "tool call without a name";
    if (toolNames.size && !toolNames.has(tc.name)) return `unknown tool: ${String(tc.name).slice(0, 40)}`;
    const a = tc.args;
    if (a && typeof a === "object" && Object.keys(a).length === 1 && typeof a.raw === "string") return "tool-call arguments are not valid JSON";
  }
  if (!(resp.toolCalls?.length) && !String(resp.content ?? "").trim()) return "empty output";
  return null;
}

function toAnthropicTools(tools) {
  return (tools ?? []).map((t) => t?.function
    ? { name: t.function.name, description: t.function.description ?? "", input_schema: t.function.parameters ?? { type: "object", properties: {} } }
    : t);
}

function paidRate(modelId, catalog) {
  const rates = catalog?.paid?.rates ?? {};
  if (rates[modelId]) return rates[modelId];
  let best = null;
  for (const k of Object.keys(rates)) if (String(modelId).startsWith(k) && (!best || k.length > best.length)) best = k;
  return best ? rates[best] : (catalog?.paid?.default ?? { in: 2, out: 8, tier: 3 });
}

function paidCandidates(paid, { estTokens, estimateCost, catalog }) {
  const out = [];
  for (const p of paid ?? []) {
    if (!p?.provider || NON_PAID.has(p.provider) || !p.id) continue;
    // A resolved entry that is actually a free-tier model (e.g. GROQ_API_KEY
    // auto-detected as the active provider) is already in the free ladder.
    const poolName = p.provider === "google" ? "gemini" : p.provider;
    if ((catalog?.providers?.[poolName]?.models ?? []).some((m) => m.id === p.id)) continue;
    const rate = paidRate(p.id, catalog);
    const est = estimateCost(p.id, { inputTokens: estTokens, outputTokens: OUT_TOKENS_EST });
    out.push({
      id: `paid:${p.provider}/${p.id}`,
      target: `${p.provider}/${p.id}`,
      provider: p.provider,
      model: p.id,
      cfg: p,
      free: false,
      local: false,
      tier: Math.min(4, Math.max(1, Number(rate.tier ?? 3))),
      tools: true,
      score: 0,
      estCostUsd: Number(est.toFixed(6)),
    });
  }
  return out;
}

function learnFromHeaders(c, headers) {
  if (!headers || !c.free) return null;
  const parsed = parseRateHeaders(headers, { requestsMeaning: c.limitsHeader, nowMs: L.now() });
  if (Object.keys(parsed.limits).length) L.learnLimits(c.provider, c.model, c.keyHash, parsed.limits, "headers");
  return parsed;
}

// Apply a failure to the ledger (cooldowns, strikes, learned ceilings).
function applyFailure(c, cls, err, headers) {
  if (!c.free) return;
  const msg = redactSecrets(String(err?.message ?? err ?? "")).slice(0, 200);
  L.recordFailure(c.provider, c.model, c.keyHash, `${cls}: ${msg}`);
  const t = L.now();
  if (c.local) { if (cls !== "invalid" && cls !== "bad_request") L.setCooldown(c.provider, c.model, c.keyHash, t + 5000, cls); return; }
  switch (cls) {
    case "rate_limit": {
      const body = parseLimitFromBody(err?.message);
      if (Object.keys(body.limits).length) L.learnLimits(c.provider, c.model, c.keyHash, body.limits, "429-body");
      else if (body.window === "day" && c.used?.rpd > 0) L.learnLimits(c.provider, c.model, c.keyHash, { rpd: c.used.rpd }, "429-observed");
      const ra = parseRetryAfter(headerGetter(headers)("retry-after"), t);
      if (ra != null) L.setCooldown(c.provider, c.model, c.keyHash, t + Math.min(ra, 86400000), "429 retry-after");
      else if (body.window === "day") L.setCooldown(c.provider, c.model, c.keyHash, L.nextUtcMidnight(t), "429 daily quota");
      else { const s = L.strike(c.provider, c.model, c.keyHash); L.setCooldown(c.provider, c.model, c.keyHash, s.untilMs, `429 strike ${s.strikes}`); }
      break;
    }
    case "server": case "timeout": case "network":
      L.setCooldown(c.provider, c.model, c.keyHash, t + 30000, cls);
      break;
    case "auth":
      L.setCooldown(c.provider, "*", c.keyHash, t + 3600000, "auth rejected");
      break;
    case "not_found":
      L.setCooldown(c.provider, c.model, c.keyHash, t + 86400000, "model not found");
      break;
    default: break; // bad_request / invalid: no bench — the request, not the host, was the problem
  }
}

// cfg: { id: strategy|pin, convKey, pool: { paid, localModel }, budget }
// deps: { openaiChat, anthropicChat, estimateCost } (injected: no import cycle)
export async function freepoolChat(cfg, { system, messages, tools, timeoutMs = null }, deps, opts = {}) {
  const { strategy, pin } = parseFreepoolId(cfg.id);
  const catalog = opts.catalog ?? loadCatalog();
  const members = poolMembers({ env: opts.env, catalog, localModel: cfg.pool?.localModel });
  const needTools = (tools?.length ?? 0) > 0;
  const toolNames = toolNamesOf(tools);
  const estTokens = estimateTokens({ system, messages, tools });
  const wallMs = Math.max(1, Number(timeoutMs ?? 120000));
  const maxAttempts = Math.max(1, Number(process.env.APE_FREEPOOL_MAX_ATTEMPTS ?? 6) || 6);
  const t0 = Date.now();
  const exclude = new Set();
  const attempts = [];
  const escalations = [];
  const budgetSkips = [];

  const isCost = strategy === "cost";
  const req = isCost
    ? await requiredTier({ messages, tools, estTokens, priorFailures: priorFailuresFor(cfg.convKey) })
    : null;
  let tier = req?.tier ?? 1;
  const paid = isCost ? paidCandidates(cfg.pool?.paid, { estTokens, estimateCost: deps.estimateCost, catalog }) : [];

  if (!members.length && !paid.length) {
    const e = new Error("freepool: no members configured (set a free-tier key such as GROQ_API_KEY; see docs/freepool.md)");
    e.decision = { strategy, attempts: [], escalations: [] };
    throw e;
  }

  const decisionBase = () => ({
    strategy,
    ...(pin ? { pin } : {}),
    ...(req ? { category: req.category, required_tier: req.tier, tier_source: req.source, final_tier: tier } : {}),
    escalations: escalations.slice(0, 6),
    attempts: attempts.slice(0, 8),
    ...(budgetSkips.length ? { budget_blocked: [...new Set(budgetSkips)].slice(0, 4) } : {}),
  });

  let lastErr = null;
  let stopReason = "exhausted";
  while (true) {
    if (attempts.length >= maxAttempts) { stopReason = "max_attempts"; break; }
    const remaining = wallMs - (Date.now() - t0);
    if (remaining <= 0) { stopReason = "wall_budget"; break; }

    let pick = null;
    if (isCost) {
      const free = buildCandidates(members, { strategy, needTools, estTokens, exclude, pin }).candidates.filter((c) => c.tier >= tier);
      const paidOk = [];
      for (const p of paid) {
        if (exclude.has(p.id) || p.tier < tier) continue;
        const left = budgetLeftFor(p.provider, cfg.budget);
        if (p.estCostUsd > left) { budgetSkips.push(`${p.target} est $${p.estCostUsd} > left $${Number.isFinite(left) ? Number(left.toFixed(6)) : left}`); continue; }
        paidOk.push(p);
      }
      pick = sortForCost([...free, ...paidOk])[0] ?? null;
      if (!pick) {
        if (tier < 4) { escalations.push({ from: tier, to: tier + 1, reason: "no candidate at tier" }); tier++; continue; }
        break;
      }
    } else {
      pick = buildCandidates(members, { strategy, needTools, estTokens, exclude, pin }).candidates[0] ?? null;
      if (!pick) break;
    }

    const attemptCap = Math.max(1, Number(process.env.APE_FREEPOOL_ATTEMPT_TIMEOUT_MS ?? ATTEMPT_CAP_MS) || ATTEMPT_CAP_MS);
    const perTimeout = Math.max(1, Math.min(remaining, attemptCap));
    let headers = null;
    const started = Date.now();
    try {
      let resp;
      if (pick.free) {
        resp = await deps.openaiChat(
          { provider: pick.provider, id: pick.model, key: pick.key, baseUrl: pick.baseUrl, onResponse: (res) => { headers = res.headers; } },
          system, messages, tools, perTimeout);
      } else if (pick.provider === "anthropic") {
        resp = await deps.anthropicChat({ ...pick.cfg, provider: "anthropic" }, system, messages, toAnthropicTools(tools), perTimeout);
      } else {
        resp = await deps.openaiChat({ provider: pick.provider, id: pick.model, key: pick.cfg.key, baseUrl: pick.cfg.baseUrl, onResponse: (res) => { headers = res.headers; } }, system, messages, tools, perTimeout);
      }
      const parsed = learnFromHeaders(pick, headers);
      const bad = validateResponse(resp, toolNames);
      if (bad) { const e = new Error(bad); e.invalid = true; throw e; }
      const latency = Date.now() - started;
      const tokens = (resp.usage?.inputTokens ?? 0) + (resp.usage?.outputTokens ?? 0);
      if (pick.free) {
        L.recordUsage(pick.provider, pick.model, pick.keyHash, tokens);
        L.recordSuccess(pick.provider, pick.model, pick.keyHash, latency);
        if (parsed?.exhaustedUntil) L.setCooldown(pick.provider, pick.model, pick.keyHash, parsed.exhaustedUntil, `exhausted ${parsed.exhaustedWindow}`);
      }
      const costUsd = pick.free ? 0 : Number(deps.estimateCost(pick.model, resp.usage ?? { inputTokens: 0, outputTokens: 0 }).toFixed(6));
      attempts.push({ target: pick.target, outcome: "ok", ms: latency });
      return {
        ...resp,
        servedBy: { provider: pick.provider, model: pick.model, ...(pick.free ? { key_slot: pick.slot } : {}), tier: pick.tier, free: pick.free, local: pick.local },
        costUsd,
        freepool: {
          ...decisionBase(),
          chosen: pick.target,
          est_cost_usd: pick.free ? 0 : pick.estCostUsd,
          ...(pick.free ? {} : { paid_reason: `no free candidate available at tier ${tier} (${attempts.filter((x) => x.outcome !== "ok" && !x.target.startsWith(pick.provider + "/")).length} free attempts failed)` }),
        },
      };
    } catch (err) {
      lastErr = err;
      const cls = classifyFailure(err);
      exclude.add(pick.id);
      if (pick.free && cls !== "rate_limit") L.recordUsage(pick.provider, pick.model, pick.keyHash, 0);
      if (headers) learnFromHeaders(pick, headers);
      applyFailure(pick, cls, err, headers);
      attempts.push({ target: pick.target, outcome: cls, ...(err?.status ? { status: err.status } : {}) });
      if (isCost && QUALITY_FAILURES.has(cls)) {
        notePriorFailure(cfg.convKey);
        if (tier < 4) { escalations.push({ from: tier, to: tier + 1, reason: cls }); tier++; }
      }
    }
  }
  const summary = attempts.map((a) => `${a.target}:${a.outcome}`).join(", ") || "no eligible candidate";
  const e = new Error(redactSecrets(`freepool: no candidate served (${stopReason}; ${summary})${lastErr ? ` last: ${String(lastErr.message ?? lastErr).slice(0, 160)}` : ""}`));
  e.decision = { ...decisionBase(), stop: stopReason };
  throw e;
}

// --- read-only surfaces (no secrets: key presence as booleans, slots only) ---
export function freepoolStatus(opts = {}) {
  const inventory = memberInventory(opts.env);
  const members = poolMembers({ env: opts.env });
  const t = L.now();
  const detail = members.map((m) => ({
    provider: m.provider,
    tos: m.tos,
    key_present: true,
    key_count: m.local ? 0 : m.keys.length,
    models: m.models.map((model) => ({
      id: model.id,
      tier: model.tier,
      tier_name: TIER_NAMES[model.tier] ?? null,
      tools: !!model.tools,
      keys: m.keys.map((key, slot) => {
        const kh = L.keyHash(key);
        const lim = L.effectiveLimits(m.provider, model.id, kh, model.limits);
        const used = L.usage(m.provider, model.id, kh);
        const cd = L.cooldown(m.provider, model.id, kh);
        const h = L.health(m.provider, model.id, kh);
        const headroom = {};
        for (const k of ["rpm", "rpd", "tpm", "tpd"]) if (lim[k] != null) headroom[k] = Math.max(0, lim[k] - used[k]);
        return {
          slot,
          used,
          limits: lim,
          headroom,
          cooldown: cd ? { until: new Date(cd.until).toISOString(), seconds_left: Math.ceil((cd.until - t) / 1000), reason: cd.reason, scope: cd.scope } : null,
          successes: h.successes,
          failures: h.failures,
          latency_ms: h.latencyMs,
          last_error: h.lastError ? redactSecrets(h.lastError) : null,
          last_error_at: h.lastErrorAt ? new Date(h.lastErrorAt).toISOString() : null,
        };
      }),
    })),
  }));
  return {
    members: inventory,
    active: detail,
    active_count: members.length,
    excluded: EXCLUDED_PROVIDERS,
    strategies: Object.keys(STRATEGIES),
    egress_hosts: freepoolEgressHosts(opts.env),
    catalog_updated: loadCatalog().updated ?? null,
    ledger: "freepool.db",
    note: "personal use only; do not expose a freepool-backed APE publicly (see docs/freepool.md)",
  };
}

export function freepoolModels({ provider = null, tools = null } = {}) {
  const cat = loadCatalog();
  const active = new Set(poolMembers().map((m) => m.provider));
  const rows = [];
  for (const [p, entry] of Object.entries(cat.providers ?? {})) {
    if (provider && p !== provider) continue;
    const spec = PROVIDER_SPECS[p];
    if (!spec) continue;
    for (const m of entry.models ?? []) {
      if (m.retired || (spec.modelFilter && !spec.modelFilter(m.id))) continue;
      if (tools === true && !m.tools) continue;
      rows.push({ provider: p, id: m.id, tier: m.tier, tier_name: TIER_NAMES[m.tier] ?? null, speed: m.speed, context: m.context, tools: !!m.tools, limits: m.limits ?? {}, available: active.has(p), tos: entry.tos ?? "unknown" });
    }
  }
  return { models: rows, count: rows.length, catalog_updated: cat.updated ?? null };
}
