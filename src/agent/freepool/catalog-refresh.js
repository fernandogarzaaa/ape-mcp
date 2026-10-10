// Catalog refresh: discover each provider's current model list (with the
// keys available) and merge it into catalog/freepool.json. Pure merge logic
// is separate from I/O so it is unit-testable; scripts/refresh-catalog.mjs is
// the CLI wrapper and .github/workflows/refresh-catalog.yml opens a PR with
// the diff (never auto-merged).
//
// Merge rules (curation wins):
//   - existing entries keep every curated field (tier, limits, tools, speed);
//     discovered context fills only a missing context.
//   - new ids are added with conservative defaults: tier guessed from the
//     name, tools=false unless the provider says the model supports tools,
//     limits unknown (null), "added" date set — a human reviews the PR.
//   - entries no longer listed are marked retired (never deleted); a retired
//     id that reappears is revived.
//   - OpenRouter: only ":free" ids. Non-chat ids (embeddings, audio, image,
//     guard/moderation, rerank) are ignored everywhere.
//   - base URLs and env names are never written: egress stays in code.
import { PROVIDER_SPECS, keysFor } from "./members.js";

const NON_CHAT = /(embed|whisper|tts|audio|speech|transcri|image|vision-only|guard|moderat|rerank|stable-diffusion|flux|sdxl|dall-e|playai|orpheus|ocr|bge-|e5-|clip|detr|resnet|m2m|distil|bart|melo|aura|lucid|phoenix|segment|safety)/i;

export function isChatModelId(id) {
  return typeof id === "string" && id.length > 0 && id.length < 160 && !NON_CHAT.test(id);
}

// Rough capability tier from the model name when nothing better is known.
export function guessTier(id) {
  const s = String(id).toLowerCase();
  const b = s.match(/(\d+(?:\.\d+)?)b\b/);
  if (/(gpt-5|gpt-4\.1(?!-mini|-nano)|claude|gemini-[\d.]+-pro|deepseek-(?:v3|r1|chat)|480b|405b|671b|kimi-k2)/.test(s)) return 4;
  if (b) {
    const n = Number(b[1]);
    if (n >= 100) return 3;
    if (n >= 20) return 2;
    return 1;
  }
  if (/(mini|small|lite|nano|instant|flash-lite|8b|7b|3b|1b)/.test(s)) return 1;
  if (/(large|pro|max|120b|235b|coder)/.test(s)) return 3;
  return 2;
}

// discovered: [{ id, context?, tools? }]
export function mergeProvider(entry, discovered, { provider, today }) {
  const spec = PROVIDER_SPECS[provider];
  const filter = (id) => isChatModelId(id) && (!spec?.modelFilter || spec.modelFilter(id));
  const found = new Map();
  for (const d of discovered ?? []) if (d?.id && filter(d.id) && !found.has(d.id)) found.set(d.id, d);
  const out = { ...(entry ?? {}), models: [] };
  const added = [];
  const retired = [];
  const revived = [];
  const seen = new Set();
  for (const m of entry?.models ?? []) {
    seen.add(m.id);
    const d = found.get(m.id);
    if (d) {
      const next = { ...m };
      if (next.retired) { delete next.retired; revived.push(m.id); }
      if (next.context == null && Number(d.context) > 0) next.context = Number(d.context);
      if (next.tools == null && typeof d.tools === "boolean") next.tools = d.tools;
      out.models.push(next);
    } else {
      out.models.push(m.retired ? m : { ...m, retired: today });
      if (!m.retired) retired.push(m.id);
    }
  }
  for (const [id, d] of found) {
    if (seen.has(id)) continue;
    out.models.push({
      id,
      tier: guessTier(id),
      speed: 2,
      context: Number(d.context) > 0 ? Number(d.context) : null,
      tools: d.tools === true,
      limits: { rpm: null, rpd: null, tpm: null, tpd: null },
      added: today,
    });
    added.push(id);
  }
  return { entry: out, added, retired, revived };
}

// Whole-catalog merge. results: { [provider]: discovered[] | { error } }.
// Providers without results (no key / failed) are left untouched.
export function mergeCatalog(catalog, results, { today }) {
  const next = { ...catalog, providers: { ...(catalog.providers ?? {}) } };
  const report = {};
  for (const [provider, res] of Object.entries(results ?? {})) {
    if (!PROVIDER_SPECS[provider]) { report[provider] = { skipped: "unknown provider" }; continue; }
    if (!Array.isArray(res)) { report[provider] = { skipped: res?.error ?? "no data" }; continue; }
    // An empty listing is far more likely an API hiccup than every model
    // disappearing; refusing to retire on empty keeps the catalog stable.
    if (!res.length) { report[provider] = { skipped: "empty listing" }; continue; }
    const r = mergeProvider(next.providers[provider] ?? { name: provider, tos: "unknown", models: [] }, res, { provider, today });
    next.providers[provider] = r.entry;
    report[provider] = { added: r.added, retired: r.retired, revived: r.revived };
  }
  const changed = Object.values(report).some((r) => r.added?.length || r.retired?.length || r.revived?.length);
  if (changed) next.updated = today;
  return { catalog: next, report, changed };
}

// --- discovery (network; fetchImpl injected for tests) ---
async function getJson(fetchImpl, url, headers) {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

export async function discoverProvider(provider, { env = process.env, fetchImpl = fetch } = {}) {
  const spec = PROVIDER_SPECS[provider];
  const keys = keysFor(provider, env);
  if (!spec || !keys.length) return null; // no key: not queried
  const key = keys[0];
  const auth = { authorization: `Bearer ${key}` };
  if (provider === "github") {
    const j = await getJson(fetchImpl, "https://models.github.ai/catalog/models", { ...auth, accept: "application/vnd.github+json" });
    return (Array.isArray(j) ? j : []).map((m) => ({
      id: m.id,
      context: m.limits?.max_input_tokens ?? null,
      tools: Array.isArray(m.capabilities) ? m.capabilities.includes("tool-calling") : undefined,
    }));
  }
  if (provider === "cloudflare") {
    const acct = String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
    if (!/^[a-f0-9]{32}$/i.test(acct)) return null;
    const j = await getJson(fetchImpl, `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/models/search?task=Text%20Generation&per_page=200`, auth);
    return (j.result ?? []).map((m) => ({
      id: m.name,
      context: Number((m.properties ?? []).find((p) => p.property_id === "context_window")?.value) || null,
      tools: (m.properties ?? []).some((p) => p.property_id === "function_calling" && String(p.value) === "true") || undefined,
    }));
  }
  const base = spec.base(env);
  if (!base) return null;
  const j = await getJson(fetchImpl, `${base}/models`, auth);
  const data = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : Array.isArray(j) ? j : [];
  return data.map((m) => {
    const id = String(m.id ?? m.name ?? "").replace(/^models\//, "");
    const params = m.supported_parameters;
    return {
      id,
      context: m.context_length ?? m.context_window ?? m.max_context_length ?? null,
      tools: Array.isArray(params) ? params.includes("tools") : (typeof m.capabilities?.function_calling === "boolean" ? m.capabilities.function_calling : undefined),
    };
  });
}

export async function discoverAll({ env = process.env, fetchImpl = fetch } = {}) {
  const results = {};
  for (const provider of Object.keys(PROVIDER_SPECS)) {
    try {
      const r = await discoverProvider(provider, { env, fetchImpl });
      if (r) results[provider] = r;
    } catch (e) {
      // Never echo response bodies or keys: status code only.
      results[provider] = { error: `discovery failed (${e?.status ?? e?.name ?? "error"})` };
    }
  }
  return results;
}
