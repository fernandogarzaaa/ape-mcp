// Shared test helpers for the freepool suites (not a test file itself).
// Mocked fetch only: no test in these suites touches the network.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROVIDER_SPECS } from "../src/agent/freepool/members.js";
import * as L from "../src/agent/freepool/ledger.js";
import { _resetRunMemory, registerTierClassifier } from "../src/agent/freepool/costroute.js";

const POOL_ENV = new Set(["APE_FREEPOOL_LOCAL_MODEL", "APE_FREEPOOL_MAX_ATTEMPTS", "APE_FREEPOOL_ATTEMPT_TIMEOUT_MS", "APE_COST_ROUTING", "APE_LOCAL_BASE_URL"]);
for (const s of Object.values(PROVIDER_SPECS)) {
  for (const e of s.env) POOL_ENV.add(e);
  for (const e of s.requires ?? []) POOL_ENV.add(e);
}
const saved = {};
for (const k of POOL_ENV) saved[k] = process.env[k];
const realFetch = globalThis.fetch;

// Fresh, isolated state: new data dir (new freepool.db), no pool env keys,
// real clock, no run memory, no classifier hook, real fetch.
export function fresh(env = {}) {
  process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-freepool-"));
  L._closeLedger();
  L._setClock(null);
  _resetRunMemory();
  registerTierClassifier(null);
  for (const k of POOL_ENV) delete process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  globalThis.fetch = realFetch;
  return process.env.APE_DATA_DIR;
}

export function restore() {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = realFetch;
  L._setClock(null);
  L._closeLedger();
}

// routes(url, init, calls) -> { status, body, headers, delayMs }
export function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const call = {
      url: u,
      host: new URL(u).host,
      auth: init.headers?.authorization ?? init.headers?.["x-api-key"] ?? null,
      body: init.body ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    const r = (await routes(u, init, calls, call)) ?? { status: 500, body: { error: "unrouted" } };
    if (r.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, r.delayMs);
        init.signal?.addEventListener("abort", () => { clearTimeout(t); const e = new Error("This operation was aborted"); e.name = "AbortError"; reject(e); });
      });
    }
    const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {});
    return new Response(body, { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  };
  return calls;
}

export const okChat = (content = "ok", extra = {}, usage = { prompt_tokens: 10, completion_tokens: 5 }) => ({
  status: 200,
  body: { choices: [{ message: { content, ...extra }, finish_reason: "stop" }], usage },
});
export const toolChat = (name, args) => ({
  status: 200,
  body: {
    choices: [{ message: { content: "", tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
    usage: { prompt_tokens: 20, completion_tokens: 8 },
  },
});
export const anthropicOk = (text = "paid answer") => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } },
});

export const FINISH_TOOL = [{ type: "function", function: { name: "finish", description: "finish", parameters: { type: "object", properties: { summary: { type: "string" } } } } }];
export const msg = (content) => [{ role: "user", content }];
