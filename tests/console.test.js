import test from "node:test";
import assert from "node:assert";
// Worker-forking suites share one ledger DB across parallel processes: raise
// the production concurrency guard (spend ceiling still applies).
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
// W-4: test-only mock-input flag (production servers strip _mockScript).
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { startConsole } from "../src/console.js";

let base = null;
let server = null;
let auth = {};
const withAuth = (extra = {}) => ({ ...extra, ...auth });

test("console: boots and serves new observability endpoints", async () => {
  const started = await startConsole({ port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}/`;
  assert.ok(started.token, "server mints a per-session token");
  auth = { Authorization: `Bearer ${started.token}` };
  const get = async (p) => (await (await fetch(base + p, { headers: auth })).json());

  const tools = await get("api/tools");
  assert.ok(tools.tools.length >= 20, "tools listed");

  const runs = await get("api/runs");
  assert.ok(Array.isArray(runs.runs), "runs is an array");

  const spend = await get("api/spend");
  assert.ok(typeof spend.today_usd === "number", "spend has today_usd");
  assert.ok(typeof spend.daily_cap_usd === "number", "spend has cap");

  const conns = await get("api/connectors");
  assert.ok(conns.connectors.some((c) => c.name === "web"), "bundled web connector listed");

  const profs = await get("api/profiles");
  assert.ok(profs.profiles.some((p) => p.name === "repo-triage"), "bundled profiles listed");

  const tpl = await get("api/templates");
  assert.ok(tpl.profile.includes("name: my-agent"), "profile template served");
  assert.ok(tpl.connector.includes("name: my_api"), "connector template served");

  const one = await get("api/profile?name=repo-triage");
  assert.ok(one.yaml.includes("repo-triage"), "profile YAML served");

  const bad = await (await fetch(base + "api/profile?name=../evil", { headers: auth })).json();
  assert.ok(bad.error, "path traversal rejected");
});

test("console: profile save validates and round-trips", async () => {
  const yaml = "name: console-test-profile\ndescription: test\nmodel:\n  provider: mock\n  id: mock-model\nsystem: hi\ntools:\n  - builtin: finish\nlimits:\n  max_steps: 2\n";
  const r = await (await fetch(base + "api/profile/save", {
    method: "POST", headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ name: "console-test-profile", yaml }),
  })).json();
  assert.equal(r.ok, true);
  const back = await (await fetch(base + "api/profile?name=console-test-profile", { headers: auth })).json();
  assert.ok(back.yaml.includes("console-test-profile"));

  const badYaml = await (await fetch(base + "api/profile/save", {
    method: "POST", headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ name: "bad", yaml: "name: bad\nno-model-here: true\n" }),
  })).json();
  assert.ok(badYaml.error, "invalid profile rejected");

  const badName = await (await fetch(base + "api/profile/save", {
    method: "POST", headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ name: "../../evil", yaml }),
  })).json();
  assert.ok(badName.error, "bad name rejected");
});

test("console: connector save validates", async () => {
  const yaml = "name: console-test-conn\ndescription: test\nbase_url: https://example.com\negress_allow: [example.com]\noperations:\n  - name: ping\n    method: GET\n    path: /ping\n";
  const r = await (await fetch(base + "api/connector/save", {
    method: "POST", headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ name: "console-test-conn", yaml }),
  })).json();
  assert.equal(r.ok, true);
});

test("console: runs/stream pushes run, step, and spend events", async () => {
  // Seed a finished mock run so the first tick has something to emit.
  const { dispatchCall } = await import("../src/server.js");
  const r = await dispatchCall("ape_agent_run", {
    profile: "repo-triage",
    objective: "sse check",
    _mockScript: [{ tool: "finish", args: { summary: "sse" } }],
  }, { headlessBypass: true });
  const runId = r.structuredContent.result.run_id;
  for (let i = 0; i < 30; i++) {
    await new Promise((x) => setTimeout(x, 200));
    const g = await dispatchCall("ape_agent_status", { run_id: runId });
    if (g.structuredContent.result.status !== "running") break;
  }
  const seen = new Set();
  let reader = null;
  try {
    const resp = await fetch(base + "api/runs/stream?since_step=0", { headers: auth });
    reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((res) => setTimeout(() => res(null), 1500)),
      ]);
      if (!chunk) continue;
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      for (const line of buf.split("\n")) {
        const m = /^event: (\w+)/.exec(line.trim());
        if (m) seen.add(m[1]);
      }
      if (seen.has("run") && seen.has("step") && seen.has("spend")) break;
    }
  } catch { /* network abort is fine */ }
  try { await reader?.cancel(); } catch { /* ignore */ }
  assert.ok(seen.has("run"), "run event streamed");
  assert.ok(seen.has("step"), "step event streamed");
  assert.ok(seen.has("spend"), "spend event streamed");
});

test("console: session bearer gates every /api route; CORS stays same-origin only", async () => {
  // Per-session token model: the token startConsole minted (no env needed).
  const anon = await fetch(base + "api/runs");
  assert.equal(anon.status, 401, "unauthenticated reads refused by default");
  const authed = await fetch(base + "api/runs", { headers: auth });
  assert.equal(authed.status, 200, "session bearer reads allowed");
  const trace = await fetch(base + "api/trace");
  assert.equal(trace.status, 401, "trace refused without bearer");
  const call = await fetch(base + "api/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(call.status, 401, "writes still refused");
  // Public allowlist stays public.
  assert.equal((await fetch(base + ".well-known/oauth-protected-resource")).status, 200, "metadata public");
  assert.equal((await fetch(base)).status, 200, "shell public");
  // CORS: foreign origin gets no ACAO; same origin gets an echo.
  const host = new URL(base).host;
  const evil = await fetch(base + "api/tools", { headers: { Origin: "https://evil.example" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null, "no echo for foreign origins");
  const same = await fetch(base + "api/tools", { headers: { Origin: `http://${host}`, ...auth } });
  assert.equal(same.headers.get("access-control-allow-origin"), `http://${host}`, "same origin echoed");
  assert.equal(same.status, 200);
  const preflight = await fetch(base + "api/tools", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  assert.equal(preflight.status, 403, "foreign preflight refused");
});

test("console: APE_CONSOLE_TOKEN overrides the session token when set", async () => {
  const prev = process.env.APE_CONSOLE_TOKEN;
  process.env.APE_CONSOLE_TOKEN = "test-console-token-abc123";
  try {
    const anon = await fetch(base + "api/runs");
    assert.equal(anon.status, 401, "unauthenticated reads refused");
    const wrong = await fetch(base + "api/runs", { headers: { Authorization: "Bearer wrong" } });
    assert.equal(wrong.status, 401, "wrong bearer refused");
    const ok = await fetch(base + "api/runs", { headers: { Authorization: "Bearer test-console-token-abc123" } });
    assert.equal(ok.status, 200, "static bearer allowed");
  } finally {
    if (prev === undefined) delete process.env.APE_CONSOLE_TOKEN;
    else process.env.APE_CONSOLE_TOKEN = prev;
  }
});

test.after(() => { try { server?.close(); } catch { /* ignore */ } });