// freepool members: the free OpenAI-compatible tiers APE may stack.
// Base URLs and credential env vars live HERE, in code, never in the catalog:
// the nightly catalog refresh may change model lists and limits, but it can
// never add a network destination (egress stays reviewable in source and is
// listed by `ape-mcp doctor`). Cohere is deliberately absent: its trial-key
// terms forbid personal/production use outside evaluation.
//
// Keys come only from environment variables. Several keys per provider are
// allowed (comma-separated) and rotated. A member with no key is skipped
// silently and never attempted. Keys are never logged, persisted, or
// returned: status surfaces expose booleans and key counts only.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = join(here, "..", "..", "..", "catalog", "freepool.json");

// env: credential variables in priority order (all are read and merged).
// base(env): base URL (may depend on another env var, e.g. Cloudflare account).
// requires: extra non-secret env needed to build the URL.
export const PROVIDER_SPECS = {
  groq: { env: ["GROQ_API_KEY"], base: () => "https://api.groq.com/openai/v1" },
  cerebras: { env: ["CEREBRAS_API_KEY"], base: () => "https://api.cerebras.ai/v1" },
  gemini: { env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], base: () => "https://generativelanguage.googleapis.com/v1beta/openai" },
  mistral: { env: ["MISTRAL_API_KEY"], base: () => "https://api.mistral.ai/v1" },
  openrouter: { env: ["OPENROUTER_API_KEY"], base: () => "https://openrouter.ai/api/v1", modelFilter: (id) => id.endsWith(":free") },
  nvidia: { env: ["NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY"], base: () => "https://integrate.api.nvidia.com/v1" },
  github: { env: ["GITHUB_MODELS_TOKEN", "GITHUB_TOKEN"], base: () => "https://models.github.ai/inference" },
  cloudflare: {
    env: ["CLOUDFLARE_API_TOKEN"],
    requires: ["CLOUDFLARE_ACCOUNT_ID"],
    base: (env) => {
      const acct = String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
      // Account ids are 32 hex chars; anything else must not shape a URL.
      if (!/^[a-f0-9]{32}$/i.test(acct)) return null;
      return `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/v1`;
    },
    egressOrigin: "https://api.cloudflare.com",
  },
  huggingface: { env: ["HF_TOKEN", "HUGGINGFACE_API_KEY"], base: () => "https://router.huggingface.co/v1" },
  opencode: { env: ["OPENCODE_API_KEY"], base: (env) => env.APE_OPENCODE_BASE_URL || "https://opencode.ai/zen/v1" },
};

// Providers that must never join the pool (documented reason in docs/freepool.md).
export const EXCLUDED_PROVIDERS = { cohere: "trial-key terms forbid personal/production use" };

export function parseKeys(raw) {
  return String(raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function keysFor(provider, env = process.env) {
  const spec = PROVIDER_SPECS[provider];
  if (!spec) return [];
  const all = [];
  for (const v of spec.env) for (const k of parseKeys(env[v])) if (!all.includes(k)) all.push(k);
  if (spec.requires?.some((r) => !String(env[r] ?? "").trim())) return [];
  return all;
}

let catalogCache = null;
export function loadCatalog(path = CATALOG_PATH) {
  if (path === CATALOG_PATH && catalogCache) return catalogCache;
  let cat;
  try {
    cat = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    cat = { schema: 1, providers: {}, paid: { rates: {}, default: { in: 2, out: 8, tier: 3 } } };
  }
  if (path === CATALOG_PATH) catalogCache = cat;
  return cat;
}
export function _resetCatalogCache() { catalogCache = null; }

function localMember(env, opts) {
  const model = opts.localModel || env.APE_FREEPOOL_LOCAL_MODEL || null;
  if (!model) return null;
  const base = (env.APE_LOCAL_BASE_URL || "http://localhost:11434/v1").replace(/\/$/, "");
  const tier = Math.min(4, Math.max(1, Number(env.APE_FREEPOOL_LOCAL_TIER ?? 1) || 1));
  return {
    provider: "local",
    name: "Local endpoint",
    tos: "ok",
    baseUrl: base,
    keys: [null],
    local: true,
    account_limits: {},
    models: [{ id: model, tier, speed: 2, context: Number(env.APE_FREEPOOL_LOCAL_CONTEXT ?? 32768) || 32768, tools: env.APE_FREEPOOL_LOCAL_TOOLS !== "0", limits: {} }],
  };
}

// Pool members that can actually serve: catalog providers with a key (and a
// buildable base URL), plus the local endpoint when configured. Retired
// catalog entries are dropped. opts.catalog / opts.env are test seams.
export function poolMembers(opts = {}) {
  const env = opts.env ?? process.env;
  const cat = opts.catalog ?? loadCatalog();
  const out = [];
  const local = localMember(env, opts);
  if (local) out.push(local);
  for (const [provider, spec] of Object.entries(PROVIDER_SPECS)) {
    if (EXCLUDED_PROVIDERS[provider]) continue;
    const entry = cat.providers?.[provider];
    if (!entry) continue;
    const keys = keysFor(provider, env);
    if (!keys.length) continue; // missing key: skip silently, never attempt
    const baseUrl = spec.base(env);
    if (!baseUrl) continue;
    const models = (entry.models ?? []).filter((m) => m && m.id && !m.retired && (!spec.modelFilter || spec.modelFilter(m.id)));
    if (!models.length) continue;
    out.push({ provider, name: entry.name ?? provider, tos: entry.tos ?? "ok", baseUrl, keys, account_limits: entry.account_limits ?? {}, limits_header_requests: entry.limits_header_requests, models });
  }
  return out;
}

// Every origin freepool may contact (independent of which keys are set), so
// doctor and the egress allowlist are stable and reviewable.
export function freepoolEgressHosts(env = process.env) {
  const hosts = [];
  for (const spec of Object.values(PROVIDER_SPECS)) {
    if (spec.egressOrigin) { hosts.push(spec.egressOrigin); continue; }
    try { hosts.push(new URL(spec.base(env)).origin); } catch { /* skip */ }
  }
  return [...new Set(hosts)];
}

// Non-secret inventory for status/doctor: which members exist and whether a
// key is present (boolean + count), never the key itself.
export function memberInventory(env = process.env) {
  const cat = loadCatalog();
  return Object.entries(PROVIDER_SPECS).map(([provider, spec]) => {
    const keys = keysFor(provider, env);
    const entry = cat.providers?.[provider] ?? {};
    return {
      provider,
      name: entry.name ?? provider,
      env: spec.env,
      requires: spec.requires ?? [],
      key_present: keys.length > 0,
      key_count: keys.length,
      tos: entry.tos ?? "unknown",
      models: (entry.models ?? []).filter((m) => !m.retired && (!spec.modelFilter || spec.modelFilter(m.id))).length,
    };
  });
}
