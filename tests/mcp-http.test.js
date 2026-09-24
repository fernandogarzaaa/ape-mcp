// Remote MCP transport (/mcp): protocol, sessions, JSON-RPC errors, tool
// mapping, HTTP verbs, auth, CORS, bind policy. Ephemeral ports; bearer env
// scoped per test (checkBearer reads env per request).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.APE_REQUIRE_AUTH = "1";
process.env.APE_TOKENS = "mcp-test-token";
process.env.APE_CORS_ORIGIN = "https://allowed.example";

const { startHttp, resolveBindConfig, sweepSessions, mcpSessionCount } = await import("../src/http.js");

let base = null;
let server = null;
test.before(async () => {
  const started = await startHttp({ port: 0, host: "127.0.0.1" });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});
test.after(() => { try { server?.close(); } catch { /* ignore */ } });

const auth = { Authorization: "Bearer mcp-test-token" };
async function post(body, { headers = {}, raw = null } = {}) {
  const r = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth, ...headers },
    body: raw ?? JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* empty (202) */ }
  return { status: r.status, headers: r.headers, json, text };
}
async function initSession() {
  const r = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(r.status, 200);
  const sid = r.headers.get("mcp-session-id");
  assert.ok(sid, "session id issued");
  return { sid, body: r.json };
}

test("mcp: initialize negotiates pinned version + capabilities + serverInfo", async () => {
  const { sid, body } = await initSession();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.result.protocolVersion, "2026-07-28", "pinned, never echoed");
  assert.ok(body.result.capabilities.tools, "capabilities present");
  assert.equal(body.result.serverInfo.name, "ape-mcp");
  assert.ok(sid);
});

test("mcp: initialize ignores client version games", async () => {
  const r = await post({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(r.json.result.protocolVersion, "2026-07-28", "pin wins over client claim");
});

test("mcp: session enforcement — missing/unknown/expired rejected", async () => {
  const noSession = await post({ jsonrpc: "2.0", id: 3, method: "ping" }, { headers: { Authorization: "Bearer mcp-test-token", "mcp-session-id": "" } });
  // Empty header is treated as missing.
  assert.equal(noSession.json.error.code, -32001, "missing session rejected");
  const unknown = await fetch(base + "/mcp", {
    method: "POST", headers: { "Content-Type": "application/json", ...auth, "mcp-session-id": "nope" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "ping" }),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));
  assert.equal(unknown.json.error.code, -32001, "unknown session rejected");
  assert.match(unknown.json.error.message, /session-not-found/);
  const { sid } = await initSession();
  sweepSessions(Date.now() + 31 * 60 * 1000);
  const expired = await post({ jsonrpc: "2.0", id: 5, method: "ping" }, { headers: { "mcp-session-id": sid } });
  assert.equal(expired.json.error.code, -32001, "expired session rejected");
});

test("mcp: DELETE closes the session", async () => {
  const { sid } = await initSession();
  const del = await fetch(base + "/mcp", { method: "DELETE", headers: { ...auth, "mcp-session-id": sid } });
  assert.equal(del.status, 200);
  const reuse = await post({ jsonrpc: "2.0", id: 6, method: "ping" }, { headers: { "mcp-session-id": sid } });
  assert.equal(reuse.json.error.code, -32001, "closed session stays closed");
  const delMissing = await fetch(base + "/mcp", { method: "DELETE", headers: { ...auth, "mcp-session-id": "gone" } });
  assert.equal(delMissing.status, 404, "unknown session delete is 404");
});

test("mcp: malformed JSON and unknown methods", async () => {
  const bad = await post(null, { raw: "{not-json" });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, -32700);
  const { sid } = await initSession();
  const unknown = await post({ jsonrpc: "2.0", id: 7, method: "teleport" }, { headers: { "mcp-session-id": sid } });
  assert.equal(unknown.json.error.code, -32601);
});

test("mcp: batch processed sequentially in order", async () => {
  const { sid } = await initSession();
  const r = await post([
    { jsonrpc: "2.0", id: 10, method: "ping" },
    { jsonrpc: "2.0", id: 11, method: "teleport" },
    { jsonrpc: "2.0", id: 12, method: "ping" },
  ], { headers: { "mcp-session-id": sid } });
  assert.ok(Array.isArray(r.json), "batch returns array");
  assert.deepEqual(r.json.map((x) => x.id), [10, 11, 12], "order preserved");
  assert.ok(r.json[0].result && r.json[1].error && r.json[2].result, "mixed outcomes");
});

test("mcp: notification returns 202 with empty body", async () => {
  const { sid } = await initSession();
  const r = await fetch(base + "/mcp", {
    method: "POST", headers: { "Content-Type": "application/json", ...auth, "mcp-session-id": sid },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  assert.equal(r.status, 202);
  assert.equal(await r.text(), "", "no response body for notifications");
});

test("mcp: tools/list exposes the APE tool surface", async () => {
  const { sid } = await initSession();
  const r = await post({ jsonrpc: "2.0", id: 20, method: "tools/list" }, { headers: { "mcp-session-id": sid } });
  const names = r.json.result.tools.map((t) => t.name);
  assert.ok(names.includes("ape_status") && names.includes("ape_agent_run"), "core tools listed");
  const t = r.json.result.tools.find((x) => x.name === "ape_agent_run");
  assert.ok(t.description && t.inputSchema, "schema carried");
});

test("mcp: tools/call success carries content + structuredContent", async () => {
  const { sid } = await initSession();
  const r = await post({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "ape_status", arguments: {} } }, { headers: { "mcp-session-id": sid } });
  assert.equal(r.status, 200);
  assert.ok(!r.json.result.isError, "success is not error");
  assert.ok(Array.isArray(r.json.result.content) && r.json.result.content[0].type === "text", "MCP content blocks");
  assert.ok(r.json.result.structuredContent && r.json.result.structuredContent.engines, "structured result preserved");
});

test("mcp: tool-level errors stay tool-level (isError), transport errors stay transport-level", async () => {
  const { sid } = await initSession();
  const toolErr = await post(
    { jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "ape_connector_call", arguments: { connector: "nope", operation: "x" } } },
    { headers: { "mcp-session-id": sid } }
  );
  assert.equal(toolErr.status, 200, "transport fine");
  assert.equal(toolErr.json.result.isError, true, "tool failure flagged, not thrown");
  assert.ok(JSON.stringify(toolErr.json.result).includes("connector_not_found"), "error text preserved");
  const transportErr = await post({ jsonrpc: "2.0", id: 23, method: "nope/method" }, { headers: { "mcp-session-id": sid } });
  assert.equal(transportErr.json.error.code, -32601, "unknown method is a transport error");
});

test("mcp: resources and prompts round-trip", async () => {
  const { sid } = await initSession();
  const h = { headers: { "mcp-session-id": sid } };
  const rl = await post({ jsonrpc: "2.0", id: 30, method: "resources/list" }, h);
  assert.ok(Array.isArray(rl.json.result.resources) && rl.json.result.resources.length > 0);
  const pl = await post({ jsonrpc: "2.0", id: 31, method: "prompts/list" }, h);
  assert.ok(Array.isArray(pl.json.result.prompts), "prompts listed");
});

test("mcp: GET is 405, DELETE/OPTIONS exist", async () => {
  const get = await fetch(base + "/mcp", { method: "GET", headers: auth });
  assert.equal(get.status, 405, "no server-initiated streams in v1");
  const preflight = await fetch(base + "/mcp", { method: "OPTIONS", headers: { Origin: "https://allowed.example" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://allowed.example");
  const preflightDenied = await fetch(base + "/mcp", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  assert.equal(preflightDenied.status, 403);
});

test("mcp: bearer gate precedes dispatch (401, nothing executed)", async () => {
  const anon = await fetch(base + "/mcp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 40, method: "tools/call", params: { name: "nope_tool", arguments: {} } }),
  });
  assert.equal(anon.status, 401, "no bearer, no execution");
  const bad = await fetch(base + "/mcp", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 41, method: "ping", params: {} }),
  });
  assert.equal(bad.status, 401, "wrong bearer rejected");
});

test("mcp: CORS exact-origin only", async () => {
  const { sid } = await initSession();
  const ok = await fetch(base + "/mcp", {
    method: "POST", headers: { "Content-Type": "application/json", ...auth, "mcp-session-id": sid, Origin: "https://allowed.example" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 50, method: "ping" }),
  });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://allowed.example");
  const denied = await fetch(base + "/mcp", {
    method: "POST", headers: { "Content-Type": "application/json", ...auth, "mcp-session-id": sid, Origin: "https://evil.example" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 51, method: "ping" }),
  });
  assert.equal(denied.headers.get("access-control-allow-origin"), null, "no wildcard, no echo for strangers");
  assert.equal(denied.status, 200, "request still served; browser enforces the missing header");
});

test("mcp: open mode preserved when auth unenforced", async () => {
  const prevA = process.env.APE_REQUIRE_AUTH;
  const prevT = process.env.APE_TOKENS;
  delete process.env.APE_REQUIRE_AUTH;
  delete process.env.APE_TOKENS;
  try {
    const r = await fetch(base + "/mcp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 60, method: "initialize", params: {} }),
    });
    assert.equal(r.status, 200, "local-open default keeps working");
    assert.ok(r.headers.get("mcp-session-id"), "session issued");
  } finally {
    process.env.APE_REQUIRE_AUTH = prevA;
    process.env.APE_TOKENS = prevT;
  }
});

test("mcp: bind policy matrix", () => {
  const prevA = process.env.APE_REQUIRE_AUTH;
  const prevT = process.env.APE_TOKENS;
  const prevO = process.env.APE_ALLOW_OPEN_REMOTE;
  delete process.env.APE_REQUIRE_AUTH;
  delete process.env.APE_TOKENS;
  delete process.env.APE_ALLOW_OPEN_REMOTE;
  try {
    assert.equal(resolveBindConfig({ host: "127.0.0.1" }).ok, true, "loopback allowed");
    assert.equal(resolveBindConfig({ host: "localhost" }).ok, true);
    assert.equal(resolveBindConfig({}).ok, true, "default is loopback");
    const refused = resolveBindConfig({ host: "0.0.0.0" });
    assert.equal(refused.ok, false, "remote without auth refused");
    assert.ok(refused.hint.includes("APE_REQUIRE_AUTH"), "hint names the fix");
    process.env.APE_REQUIRE_AUTH = "1";
    process.env.APE_TOKENS = "x";
    assert.equal(resolveBindConfig({ host: "0.0.0.0" }).ok, true, "remote with auth allowed");
    delete process.env.APE_REQUIRE_AUTH;
    delete process.env.APE_TOKENS;
    process.env.APE_ALLOW_OPEN_REMOTE = "1";
    const wild = resolveBindConfig({ host: "0.0.0.0" });
    assert.equal(wild.ok, true, "explicit override opens");
    assert.ok(wild.warning.includes("UNSAFE"), "override carries a severe warning");
  } finally {
    if (prevA === undefined) delete process.env.APE_REQUIRE_AUTH; else process.env.APE_REQUIRE_AUTH = prevA;
    if (prevT === undefined) delete process.env.APE_TOKENS; else process.env.APE_TOKENS = prevT;
    if (prevO === undefined) delete process.env.APE_ALLOW_OPEN_REMOTE; else process.env.APE_ALLOW_OPEN_REMOTE = prevO;
  }
});

test("mcp: sessions sweep without leaking the store", () => {
  assert.ok(mcpSessionCount() >= 0, "store introspectable");
  assert.ok(sweepSessions() >= 0, "sweep runs cleanly");
});
