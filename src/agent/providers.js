// Model providers — pluggable, config-driven. Credentials come from environment
// variables referenced by name; never stored in profile YAML.
// Supported: anthropic, openai-compatible (covers openrouter, local ollama/llama.cpp,
// gateways), mock (deterministic, offline — used by bundled tests and demos).
// Provider calls are a sanctioned network egress; `ape-mcp doctor` lists them.

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

export function estimateCost(modelId, usage) {
  const r = COST_PER_MTok[modelId] ?? DEFAULT_RATE;
  return (usage.inputTokens / 1e6) * r.in + (usage.outputTokens / 1e6) * r.out;
}

export function egressHosts() {
  return [
    "https://api.anthropic.com",
    "https://api.openai.com",
    "https://openrouter.ai",
  ];
}

function resolveEnv() {
  const v = (n) => process.env[n];
  return {
    anthropic: v("APE_ANTHROPIC_API_KEY") || v("ANTHROPIC_API_KEY"),
    openaiBase: v("APE_OPENAI_BASE_URL") || "https://api.openai.com/v1",
    openaiKey: v("APE_OPENAI_API_KEY") || v("OPENAI_API_KEY"),
    openrouterKey: v("APE_OPENROUTER_API_KEY") || v("OPENROUTER_API_KEY"),
    localBase: v("APE_LOCAL_BASE_URL") || "http://localhost:11434/v1",
  };
}

// --- Anthropic ---
async function anthropicChat(env, modelId, system, messages, tools) {
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
  const body = { model: modelId, max_tokens: 4096, system, messages: wire, tools };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropic,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
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

// --- OpenAI-compatible ---
async function openaiChat(env, base, key, modelId, system, messages, tools) {
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
    model: modelId,
    messages: [{ role: "system", content: system }, ...wire],
    tools,
    tool_choice: "auto",
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
  const env = resolveEnv();
  switch (cfg.provider) {
    case "mock":
      return mockChat(cfg.convKey ?? "default", cfg.id, system, messages, tools);
    case "anthropic":
      if (!env.anthropic) throw new Error("APE_ANTHROPIC_API_KEY not set");
      return await anthropicChat(env, cfg.id, system, messages, tools);
    case "openai":
      if (!env.openaiKey) throw new Error("APE_OPENAI_API_KEY not set");
      return await openaiChat(env, env.openaiBase, env.openaiKey, cfg.id, system, messages, tools);
    case "openrouter":
      if (!env.openrouterKey) throw new Error("APE_OPENROUTER_API_KEY not set");
      return await openaiChat(env, "https://openrouter.ai/api/v1", env.openrouterKey, cfg.id, system, messages, tools);
    case "local":
      return await openaiChat(env, env.localBase, null, cfg.id, system, messages, tools);
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