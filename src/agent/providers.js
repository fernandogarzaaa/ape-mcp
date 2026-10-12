// Model providers — pluggable, config-driven. Credentials come from environment
// variables or the HOST platform's own credential store via provider:auto detection.
// Nothing about WHICH provider is hardcoded: resolution is dynamic (hostdetect.js).
// Supported: anthropic, openai-compatible (openai, openrouter, groq, nebius, local
// ollama/llama.cpp), mock (deterministic, offline — tests/demos).
// Provider calls are a sanctioned network egress; `ape-mcp doctor` lists them.
import { detectActiveProvider, credentialFor, detectProviders, localProbe } from "./hostdetect.js";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../trace.js";
import { freepoolEgressHosts, poolMembers, loadCatalog } from "./freepool/members.js";

// User-pinned provider/model, written by the TUI provider screen into the
// same config.json the TUI uses for the default profile ({provider, model}
// beside default_profile — no secrets ever land here). Read-only on this
// side, cached by mtime. Resolution order in resolveModel: explicit
// overrides > env > this file > profile > auto-detect.
let userDefaultsCache = { path: "", mtime: 0, value: {} };
export function userDefaults() {
  try {
    const p = join(dataDir(), "config.json");
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) return {};
    if (p === userDefaultsCache.path && st.mtimeMs <= userDefaultsCache.mtime) {
      return userDefaultsCache.value;
    }
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const value = {};
    if (typeof raw?.provider === "string" && raw.provider) value.provider = raw.provider;
    if (typeof raw?.model === "string" && raw.model) value.model = raw.model;
    userDefaultsCache = { path: p, mtime: st.mtimeMs, value };
    return value;
  } catch {
    return {};
  }
}

const COST_PER_MTok = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-sonnet-4-5": { in: 3, out: 15 },
  "claude-3-7-sonnet": { in: 3, out: 15 },
  "claude-3-5-sonnet": { in: 3, out: 15 },
  "claude-3-5-haiku": { in: 0.8, out: 4 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "o3-mini": { in: 1.1, out: 4.4 },
};
const DEFAULT_RATE = { in: 2, out: 8 };

// Provider base URLs. Read per call, not frozen at import: operators (and
// tests) must be able to point a provider at another base AFTER this module
// loads (env overrides only worked when set before import).
const BASE_URLS_STATIC = {
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
};
export function baseUrlFor(provider) {
  switch (provider) {
    case "openai": return process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    case "nebius": return process.env.APE_NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1";
    case "local": return process.env.APE_LOCAL_BASE_URL || "http://localhost:11434/v1";
    case "opencode": return process.env.APE_OPENCODE_BASE_URL || "https://opencode.ai/zen/v1";
    default: return BASE_URLS_STATIC[provider];
  }
}
const OPENAI_COMPAT = new Set(["openai", "openrouter", "groq", "nebius", "opencode", "google", "local"]);

// Providers APE can actually invoke. Anything detected but not in this set (e.g.
// bedrock, which needs AWS SigV4) is honest-skipped, never silently attempted.
// "freepool" is a virtual provider: stacked free tiers behind one name
// (src/agent/freepool/, docs/freepool.md).
export const CALLABLE_PROVIDERS = new Set(["anthropic", ...OPENAI_COMPAT, "mock", "freepool"]);

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1",
  openrouter: "anthropic/claude-sonnet-4-6",
  groq: "llama-3.3-70b-versatile",
  nebius: "deepseek-ai/DeepSeek-V4-Flash-0731",
  opencode: "muse-spark-1.3-contributor-free",
  local: null,
  freepool: "auto",
};

export function defaultModelFor(provider) {
  return DEFAULT_MODELS[provider] ?? null;
}

// Rates: built-in table first, then the catalog's paid table (exact id or
// longest prefix), then the conservative default. Free-tier pool calls never
// reach here with a real model id — freepool reports costUsd 0 for them.
export function costRateFor(modelId) {
  if (COST_PER_MTok[modelId]) return COST_PER_MTok[modelId];
  try {
    const rates = loadCatalog()?.paid?.rates ?? {};
    if (rates[modelId]) return rates[modelId];
    let best = null;
    for (const k of Object.keys(rates)) if (String(modelId).startsWith(k) && (!best || k.length > best.length)) best = k;
    if (best) return rates[best];
  } catch { /* catalog optional */ }
  return DEFAULT_RATE;
}

export function estimateCost(modelId, usage) {
  const r = costRateFor(modelId);
  return (usage.inputTokens / 1e6) * r.in + (usage.outputTokens / 1e6) * r.out;
}

export function egressHosts() {
  const hosts = ["https://api.anthropic.com"];
  for (const p of ["openai", "openrouter", "groq", "nebius", "opencode", "google", "local"]) {
    try { hosts.push(new URL(baseUrlFor(p)).origin); } catch { /* skip */ }
  }
  // freepool members (fixed in code, never from the catalog).
  hosts.push(...freepoolEgressHosts());
  return [...new Set(hosts)];
}

// --- provider:auto resolution ---
// Layer order (first hit wins per field): explicit overrides > env >
// pinned file > profile > auto-detect. The pinned MODEL only counts when
// the pinned PROVIDER is the one being used — otherwise a stale pin would
// leak one provider's model id into another's calls.
export async function resolveModel(modelCfg, overrides = {}) {
  const pinned = userDefaults();
  const requestedProvider = overrides.provider || process.env.APE_PROVIDER || pinned.provider || modelCfg?.provider || "auto";
  const providerLayer = overrides.provider ? "override"
    : process.env.APE_PROVIDER ? "env"
    : pinned.provider ? "pin"
    : (modelCfg?.provider && modelCfg.provider !== "auto") ? "profile"
    : "auto";
  const pinModel = pinned.provider && pinned.provider === requestedProvider ? pinned.model : null;
  const requestedModel = overrides.model || process.env.APE_MODEL || pinModel || (modelCfg?.id && modelCfg.id !== "auto" ? modelCfg.id : null);
  const modelLayer = overrides.model ? "override"
    : process.env.APE_MODEL ? "env"
    : pinModel ? "pin"
    : (modelCfg?.id && modelCfg.id !== "auto") ? "profile"
    : "auto";
  const layers = { provider: providerLayer, model: modelLayer };

  // 1. mock / local never need a key.
  if (requestedProvider === "mock") {
    return { provider: "mock", id: requestedModel || "mock-model", key: null, resolution: "explicit", source: "mock", layers };
  }

  // 2. Explicit provider: resolve its credential (env → host stores).
  if (requestedProvider === "freepool") {
    const members = poolMembers();
    if (!members.length) {
      return {
        error: "provider_unavailable",
        provider: "freepool",
        detected: await detectProviders(),
        hint: "freepool has no members: set at least one free-tier key (e.g. GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY) — see docs/freepool.md",
        layers,
      };
    }
    return { provider: "freepool", id: requestedModel || "auto", key: null, resolution: "explicit", source: `freepool (${members.map((m) => m.provider).join(",")})`, layers };
  }
  if (requestedProvider !== "auto") {
    if (requestedProvider === "local") {
      let id = requestedModel || null;
      let source = "local";
      if (!id) {
        const probe = await localProbe();
        id = probe?.model ?? null;
        if (probe) source = probe.source;
      }
      return { provider: "local", id, key: null, baseUrl: baseUrlFor("local"), resolution: "explicit", source, layers };
    }
    const cred = await credentialFor(requestedProvider);
    if (cred) {
      return {
        provider: requestedProvider,
        id: requestedModel || defaultModelFor(requestedProvider),
        key: cred.key,
        source: cred.source,
        resolution: "explicit",
        oauth: cred.oauth,
        refreshToken: cred.refreshToken,
        layers,
      };
    }
    return {
      error: "provider_unavailable",
      provider: requestedProvider,
      detected: await detectProviders(),
      hint: "no credential found for this provider; set its env key or use provider:auto",
      layers,
    };
  }

  // 3. Auto: the provider the platform is CURRENTLY using.
  const active = await detectActiveProvider();
  if (active && CALLABLE_PROVIDERS.has(active.provider)) {
    return {
      provider: active.provider,
      id: active.model || requestedModel || defaultModelFor(active.provider),
      key: active.key ?? null,
      source: active.source,
      resolution: "active",
      oauth: active.oauth,
      refreshToken: active.refreshToken,
      layers,
    };
  }

  // 4. Best-effort: first stored credential on a callable provider.
  const stored = (await detectProviders()).filter((p) => CALLABLE_PROVIDERS.has(p));
  if (stored.length) {
    const first = stored[0];
    const cred = await credentialFor(first);
    if (cred) {
      return { provider: first, id: requestedModel || defaultModelFor(first), key: cred.key, source: cred.source, resolution: "best-effort", layers };
    }
  }

  // 5. Nothing detected.
  return { error: "no_provider_detected", detected: stored, hint: "set APE_PROVIDER or a provider key, or run a local model", layers };
}

// Ordered resolved provider chain: primary first, then profile fallbacks.
// Entries that cannot be resolved (no credential) are recorded in errors and
// skipped — a dead primary with a live fallback still runs. Overrides apply
// to the primary only. options.skipPrimary reuses an already-resolved primary
// (e.g. task-routed) and resolves just the fallbacks.
export async function resolveChain(modelCfg, overrides = {}, options = {}) {
  const chain = [];
  const errors = [];
  const push = async (cfg) => {
    const r = await resolveModel(cfg, {});
    if (r.error) errors.push({ provider: cfg?.provider ?? null, id: cfg?.id ?? null, error: r.error });
    else chain.push(r);
  };
  if (!options.skipPrimary) {
    const primary = await resolveModel(modelCfg, overrides);
    if (primary.error) errors.push({ provider: modelCfg?.provider ?? null, id: modelCfg?.id ?? null, error: primary.error });
    else chain.push(primary);
  }
  const fb = modelCfg?.fallback;
  const list = Array.isArray(fb) ? fb : (fb ? [fb] : []);
  for (const f of list) await push(f);
  return { chain, errors };
}

// Credential policy: explicit privilege boundary over ambient host credentials
// (provider:auto reuses whatever the host already holds). policy.
// credential_policy.allow, when set, filters the resolved chain — disallowed
// providers never serve the run, even if a key exists. Absent allow = current
// behavior (everything resolvable may serve). Pure; the worker applies it,
// the loop enforces per-turn spend caps from max_spend_usd separately.
export function applyCredentialPolicy(chain, policy) {
  const allow = policy?.credential_policy?.allow;
  if (!allow?.length) return { chain: chain ?? [], filtered: [] };
  const kept = [];
  const filtered = [];
  for (const e of chain ?? []) {
    if (allow.includes(e.provider)) kept.push(e);
    else filtered.push(e.provider);
  }
  return { chain: kept, filtered };
}

// --- Anthropic ---
async function anthropicChat(cfg, system, messages, tools, timeoutMs) {
  const wire = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant" && m.toolCalls?.length) {
      wire.push({ role: "assistant", content: [
        ...(m.content ? [{ type: "text", text: m.content }] : []),
        ...m.toolCalls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args })),
      ] });
    } else if (m.role === "tool") {
      wire.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: String(m.content).slice(0, 8000) }] });
    } else {
      wire.push({ role: m.role, content: m.content ?? "" });
    }
  }
  const body = { model: cfg.id, max_tokens: 4096, system, messages: wire, tools };
  let token = cfg.key ?? process.env.ANTHROPIC_API_KEY;
  const abort = timeoutMs != null ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), timeoutMs) : null;
  const call = (tok) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.oauth ? { authorization: `Bearer ${tok}` } : { "x-api-key": tok }),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    ...(abort ? { signal: abort.signal } : {}),
  });
  let res;
  try {
    res = await call(token);
    // OAuth token expired → best-effort refresh once using the host's refreshToken.
    if (res.status === 401 && cfg.oauth && cfg.refreshToken) {
      try {
        const refreshed = await refreshAnthropicOAuth(cfg.refreshToken);
        if (refreshed) { token = refreshed; res = await call(token); }
      } catch { /* keep original error */ }
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) {
    const err = new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const toolCalls = (data.content ?? []).filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} }));
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return {
    content: text,
    toolCalls,
    stop: data.stop_reason === "tool_use" ? "tool_use" : data.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
    usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
  };
}

async function refreshAnthropicOAuth(refreshToken) {
  const res = await fetch("https://api.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });
  if (!res.ok) throw new Error(`oauth refresh ${res.status}`);
  const j = await res.json();
  if (!j.access_token) throw new Error("no access_token in refresh response");
  return j.access_token;
}

// --- OpenAI-compatible ---
// A 2xx that is not JSON (wrong content-type, or a body that does not parse)
// is a broken/retired upstream, not a network fault: e.g. the retired GitHub
// Models endpoint answers 200 text/plain "OK". Flag it so freepool benches
// the host instead of reporting "network".
export async function readJson2xx(res, base) {
  let host = "upstream";
  try { host = new URL(res.url || base).host || host; } catch { /* keep */ }
  const ct = String(res.headers?.get?.("content-type") ?? "").toLowerCase();
  const text = await res.text();
  const fail = (why) => {
    const e = new Error(`non-JSON 2xx from ${host} (${why})`);
    e.status = res.status;
    e.upstreamInvalid = true;
    return e;
  };
  if (ct && !ct.includes("json")) throw fail(`content-type ${ct.split(";")[0].trim().slice(0, 60)}`);
  let data;
  try { data = JSON.parse(text); } catch { throw fail("body is not valid JSON"); }
  if (!data || typeof data !== "object") throw fail("body is not a JSON object");
  return data;
}

async function openaiChat(cfg, system, messages, tools, timeoutMs) {
  const base = cfg.baseUrl ?? baseUrlFor(cfg.provider);
  const key = cfg.key ?? (cfg.provider === "local" ? null : process.env.OPENAI_API_KEY);
  const wire = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant" && m.toolCalls?.length) {
      wire.push({ role: "assistant", content: m.content ?? "", tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.args) } })) });
    } else if (m.role === "tool") {
      wire.push({ role: "tool", tool_call_id: m.toolCallId, content: String(m.content).slice(0, 8000) });
    } else {
      wire.push({ role: m.role, content: m.content ?? "" });
    }
  }
  const body = {
    model: cfg.id,
    messages: [{ role: "system", content: system }, ...wire],
    // Some hosts reject tool_choice without tools: send both or neither.
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
  };
  const res = await (async () => {
    if (timeoutMs == null) {
      return fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body),
      });
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      return await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  })();
  // Observer hook (freepool learns rate-limit headers); never breaks a call.
  if (typeof cfg.onResponse === "function") { try { cfg.onResponse(res); } catch { /* observer only */ } }
  if (!res.ok) {
    const err = new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await readJson2xx(res, base);
  const msg = data.choices?.[0]?.message ?? {};
  const toolCalls = (msg.tool_calls ?? []).map((tc) => {
    let args = {};
    try { args = JSON.parse(tc.function.arguments ?? "{}"); } catch { args = { raw: tc.function.arguments }; }
    return { id: tc.id, name: tc.function.name, args };
  });
  return {
    content: msg.content ?? "",
    toolCalls,
    stop: data.choices?.[0]?.finish_reason ?? "stop",
    usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
  };
}

// --- Mock (deterministic, offline) ---
const mockState = new Map();
export function mockPlan(convKey, plan, costPerCall = 0) {
  mockState.set(convKey, { plan, index: 0, costPerCall });
}
export function clearMock(convKey) {
  mockState.delete(convKey);
}
async function mockChat(convKey, modelId, system, messages, tools) {
  // Snapshot-harness aid: APE_MOCK_STEP_DELAY_MS stretches a mock run so
  // pollers can observe genuine `running` frames. Mock is deterministic and
  // offline-only (tests/demos); production providers never read this.
  const delayMs = Number(process.env.APE_MOCK_STEP_DELAY_MS ?? 0);
  if (Number.isFinite(delayMs) && delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
  const st = mockState.get(convKey) ?? { plan: [], index: 0, costPerCall: 0 };
  const step = st.plan[st.index];
  st.index++;
  if (!step || step.final !== undefined) {
    return { content: step?.final ?? "Done.", toolCalls: [], stop: "end_turn", usage: { inputTokens: 1, outputTokens: 1 } };
  }
  // A script entry with calls:[...] emits a multi-call turn (parallel fan-out test path).
  if (Array.isArray(step.calls)) {
    return {
      content: step.content ?? "",
      toolCalls: step.calls.map((c, i) => ({ id: "mock-" + st.index + "-" + i, name: c.tool, args: c.args ?? {} })),
      stop: "tool_use",
      usage: { inputTokens: 1, outputTokens: 1 },
      mockCost: st.costPerCall,
    };
  }
  return {
    content: step.content ?? "",
    toolCalls: [{ id: "mock-" + st.index, name: step.tool, args: step.args ?? {} }],
    stop: "tool_use",
    usage: { inputTokens: 1, outputTokens: 1 },
    mockCost: st.costPerCall,
  };
}

// Per-call provider cap: the smaller of the provider ceiling and the run's
// remaining wall time, so a stalled model request cannot outlive
// max_wall_seconds. No wall limit configured → ceiling only.
export const PROVIDER_CALL_CAP_MS = 120000;
export function providerTimeoutMs(profile, startedAt, now = Date.now()) {
  const wall = profile?.limits?.max_wall_seconds;
  if (wall == null) return PROVIDER_CALL_CAP_MS;
  return Math.max(1, Math.min(PROVIDER_CALL_CAP_MS, startedAt + Number(wall) * 1000 - now));
}

export async function chat(cfg, { system, messages, tools, timeoutMs = null }) {
  switch (cfg.provider) {
    case "mock":
      return mockChat(cfg.convKey ?? "default", cfg.id, system, messages, tools);
    case "anthropic":
      if (!cfg.key && !process.env.ANTHROPIC_API_KEY) throw new Error("no anthropic credential");
      return await anthropicChat(cfg, system, messages, tools, timeoutMs);
    case "openai":
    case "openrouter":
    case "groq":
    case "nebius":
    case "opencode":
    case "google":
    case "local":
      return await openaiChat(cfg, system, messages, tools, timeoutMs);
    case "freepool": {
      const { freepoolChat } = await import("./freepool/index.js");
      return await freepoolChat(cfg, { system, messages, tools, timeoutMs }, { openaiChat, anthropicChat, estimateCost });
    }
    default:
      throw new Error(`unknown provider: ${cfg.provider}`);
  }
}

export function toolSchemas(cfg, tools) {
  if (cfg.provider === "anthropic") {
    return tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema ?? { type: "object", properties: {} } }));
  }
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema ?? { type: "object", properties: {} } } }));
}

export { OPENAI_COMPAT };