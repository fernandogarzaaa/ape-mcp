// Model providers — pluggable, config-driven. Credentials come from environment
// variables or the HOST platform's own credential store via provider:auto detection.
// Nothing about WHICH provider is hardcoded: resolution is dynamic (hostdetect.js).
// Supported: anthropic, openai-compatible (openai, openrouter, groq, nebius, local
// ollama/llama.cpp), mock (deterministic, offline — tests/demos).
// Provider calls are a sanctioned network egress; `ape-mcp doctor` lists them.
import { detectActiveProvider, credentialFor, detectProviders } from "./hostdetect.js";

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

// Provider → OpenAI-compatible base URL (anthropic + mock are special-cased).
const BASE_URLS = {
  openai: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  nebius: process.env.APE_NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1",
  opencode: process.env.APE_OPENCODE_BASE_URL || "https://opencode.ai/zen/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  local: process.env.APE_LOCAL_BASE_URL || "http://localhost:11434/v1",
};
const OPENAI_COMPAT = new Set(["openai", "openrouter", "groq", "nebius", "opencode", "google", "local"]);

// Providers APE can actually invoke. Anything detected but not in this set (e.g.
// bedrock, which needs AWS SigV4) is honest-skipped, never silently attempted.
export const CALLABLE_PROVIDERS = new Set(["anthropic", ...OPENAI_COMPAT, "mock"]);

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1",
  openrouter: "anthropic/claude-sonnet-4-6",
  groq: "llama-3.3-70b-versatile",
  nebius: "deepseek-ai/DeepSeek-V4-Flash-0731",
  opencode: "muse-spark-1.3-contributor-free",
  local: null,
};

export function defaultModelFor(provider) {
  return DEFAULT_MODELS[provider] ?? null;
}

export function estimateCost(modelId, usage) {
  const r = COST_PER_MTok[modelId] ?? DEFAULT_RATE;
  return (usage.inputTokens / 1e6) * r.in + (usage.outputTokens / 1e6) * r.out;
}

export function egressHosts() {
  const hosts = ["https://api.anthropic.com"];
  for (const b of Object.values(BASE_URLS)) {
    try { hosts.push(new URL(b).origin); } catch { /* skip */ }
  }
  return [...new Set(hosts)];
}

// --- provider:auto resolution ---
export async function resolveModel(modelCfg, overrides = {}) {
  const requestedProvider = overrides.provider || modelCfg?.provider || "auto";
  const requestedModel = overrides.model || (modelCfg?.id && modelCfg.id !== "auto" ? modelCfg.id : null);

  // 1. mock / local never need a key.
  if (requestedProvider === "mock") {
    return { provider: "mock", id: requestedModel || "mock-model", key: null, resolution: "explicit", source: "mock" };
  }

  // 2. Explicit provider: resolve its credential (env → host stores).
  if (requestedProvider !== "auto") {
    if (requestedProvider === "local") {
      return { provider: "local", id: requestedModel || null, key: null, baseUrl: BASE_URLS.local, resolution: "explicit", source: "local" };
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
      };
    }
    return {
      error: "provider_unavailable",
      provider: requestedProvider,
      detected: await detectProviders(),
      hint: "no credential found for this provider; set its env key or use provider:auto",
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
    };
  }

  // 4. Best-effort: first stored credential on a callable provider.
  const stored = (await detectProviders()).filter((p) => CALLABLE_PROVIDERS.has(p));
  if (stored.length) {
    const first = stored[0];
    const cred = await credentialFor(first);
    if (cred) {
      return { provider: first, id: requestedModel || defaultModelFor(first), key: cred.key, source: cred.source, resolution: "best-effort" };
    }
  }

  // 5. Nothing detected.
  return { error: "no_provider_detected", detected: stored, hint: "set APE_PROVIDER or a provider key, or run a local model" };
}

// --- Anthropic ---
async function anthropicChat(cfg, system, messages, tools) {
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
  const call = (tok) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.oauth ? { authorization: `Bearer ${tok}` } : { "x-api-key": tok }),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  let res = await call(token);
  // OAuth token expired → best-effort refresh once using the host's refreshToken.
  if (res.status === 401 && cfg.oauth && cfg.refreshToken) {
    try {
      const refreshed = await refreshAnthropicOAuth(cfg.refreshToken);
      if (refreshed) { token = refreshed; res = await call(token); }
    } catch { /* keep original error */ }
  }
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
async function openaiChat(cfg, system, messages, tools) {
  const base = cfg.baseUrl ?? BASE_URLS[cfg.provider];
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
    tools,
    tool_choice: "auto",
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
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
  const st = mockState.get(convKey) ?? { plan: [], index: 0, costPerCall: 0 };
  const step = st.plan[st.index];
  st.index++;
  if (!step || step.final !== undefined) {
    return { content: step?.final ?? "Done.", toolCalls: [], stop: "end_turn", usage: { inputTokens: 1, outputTokens: 1 } };
  }
  return {
    content: step.content ?? "",
    toolCalls: [{ id: "mock-" + st.index, name: step.tool, args: step.args ?? {} }],
    stop: "tool_use",
    usage: { inputTokens: 1, outputTokens: 1 },
    mockCost: st.costPerCall,
  };
}

export async function chat(cfg, { system, messages, tools }) {
  switch (cfg.provider) {
    case "mock":
      return mockChat(cfg.convKey ?? "default", cfg.id, system, messages, tools);
    case "anthropic":
      if (!cfg.key && !process.env.ANTHROPIC_API_KEY) throw new Error("no anthropic credential");
      return await anthropicChat(cfg, system, messages, tools);
    case "openai":
    case "openrouter":
    case "groq":
    case "nebius":
    case "opencode":
    case "google":
    case "local":
      return await openaiChat(cfg, system, messages, tools);
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