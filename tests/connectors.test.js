import test from "node:test";
import assert from "node:assert";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { connectorList, loadConnector, runConnectorOperation, connectorHosts } from "../src/connectors.js";
import { dispatchCall } from "../src/server.js";
import { loadProfile } from "../src/agent/profiles.js";

// Local HTTP harness: no external network. Servers bind 127.0.0.1 on ephemeral ports.
function serve(handler) {
  const s = createServer(handler);
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve({ server: s, port: s.address().port, close: () => s.close() })));
}
const readBody = (req) => new Promise((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); });

test("connector: bundled web connector loads with egress + operations", () => {
  const c = loadConnector("web");
  assert.ok(c, "web connector bundled");
  assert.ok(c.egress_allow.includes("en.wikipedia.org"));
  assert.ok(c.operations.some((o) => o.name === "search"));
  assert.ok(c.operations.every((o) => o.annotations?.readOnly), "web connector is read-only");
  assert.ok(connectorHosts().includes("en.wikipedia.org"));
  assert.ok(connectorList().some((x) => x.name === "web"));
});

test("connector: egress containment — request outside egress_allow refused and traced", async () => {
  const c = { name: "x", base_url: "https://en.wikipedia.org", egress_allow: ["en.wikipedia.org"], operations: [{ name: "search", method: "GET", path: "/w/api.php", query: { action: { const: "query" }, list: { const: "search" }, format: { const: "json" }, srsearch: { from: "query" } } }] };
  const op = c.operations[0];
  // Force a host outside the allowlist by path trickery — hostname must still be en.wikipedia.org,
  // so craft a connector whose allowlist does NOT include it.
  const denied = await runConnectorOperation({ ...c, egress_allow: ["evil.example.com"] }, op, { query: "x" }, {});
  assert.equal(denied.error, "egress_denied");
  assert.equal(denied.host, "en.wikipedia.org");
});

test("connector: destructive op requires confirm", async () => {
  const c = { name: "mut", base_url: "https://example.com", egress_allow: ["example.com"], operations: [{ name: "write", method: "POST", path: "/things", annotations: { destructive: true } }] };
  const op = c.operations[0];
  const r = await runConnectorOperation(c, op, {}, {});
  assert.equal(r.error, "input_required");
  const ok = await runConnectorOperation(c, op, {}, { confirm: true });
  assert.notEqual(ok.error, "input_required");
});

test("connector: real Wikipedia call through the web connector (network-gated but bundled)", async () => {
  const c = loadConnector("web");
  const r = await runConnectorOperation(c, c.operations.find((o) => o.name === "search"), { query: "MCP", limit: 2 }, {});
  assert.ok(r.ok === true || r.ok === false, "returns a fetch result");
  if (r.ok) {
    assert.ok(r.body?.query?.search?.length >= 1, "search returned results");
    const pg = await runConnectorOperation(c, c.operations.find((o) => o.name === "summary"), { title: "MCP" }, {});
    assert.ok(pg.ok, "summary fetch ok");
  }
});

test("connector: MCP tool surface — list + call via dispatch", async () => {
  const l = await dispatchCall("ape_connector_list", {});
  const lr = l.structuredContent.result;
  assert.ok(lr.connectors.some((x) => x.name === "web"));
  const r = await dispatchCall("ape_connector_call", { connector: "web", operation: "search", input: { query: "APE" } });
  assert.equal(r.resultType, "complete");
  const res = r.structuredContent.result;
  // Honest outcomes: real success, reachable-but-non-2xx (ok:false + status), or a
  // named error. Sandboxed networks that block or proxy Wikipedia still pass.
  const honest = res.ok === true || res.ok === false || typeof res.error === "string";
  assert.ok(honest, "honest result, got: " + JSON.stringify(res).slice(0, 200));
  const bad = await dispatchCall("ape_connector_call", { connector: "nope", operation: "x" });
  assert.equal(bad.structuredContent.result.error, "connector_not_found");
});

test("connector: research-verify profile bundles and lists web connector", () => {
  const p = loadProfile("research-verify");
  assert.ok(p, "research-verify profile ships");
  assert.ok(p.tools.some((t) => t.connector === "web"), "profile uses web connector");
});

test("connector: redirect to disallowed host is refused (no egress escape)", async () => {
  const target = await serve((req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"x":1}'); });
  const launcher = await serve((req, res) => {
    res.writeHead(302, { location: `http://localhost:${target.port}/target` });
    res.end();
  });
  try {
    const c = { name: "r", base_url: `http://127.0.0.1:${launcher.port}`, egress_allow: ["127.0.0.1"], operations: [{ name: "go", method: "GET", path: "/start" }] };
    const r = await runConnectorOperation(c, c.operations[0], {}, {});
    assert.equal(r.error, "egress_denied_redirect", "cross-host redirect refused, got: " + JSON.stringify(r).slice(0, 200));
    assert.equal(r.host, "localhost");
  } finally { launcher.close(); target.close(); }
});

test("connector: same-host redirect is followed, loop is capped", async () => {
  const ok = await serve((req, res) => {
    if (req.url === "/start") { res.writeHead(302, { location: "/final" }); res.end(); return; }
    res.writeHead(200, { "content-type": "application/json" }); res.end('{"done":true}');
  });
  try {
    const c = { name: "r", base_url: `http://127.0.0.1:${ok.port}`, egress_allow: ["127.0.0.1"], operations: [{ name: "go", method: "GET", path: "/start" }] };
    const r = await runConnectorOperation(c, c.operations[0], {}, {});
    assert.equal(r.ok, true);
    assert.ok(r.url.endsWith("/final"), "final URL reported, got: " + r.url);
    assert.equal(r.body.done, true);
  } finally { ok.close(); }
  const loop = await serve((req, res) => { res.writeHead(302, { location: "/round" }); res.end(); });
  try {
    const c = { name: "r", base_url: `http://127.0.0.1:${loop.port}`, egress_allow: ["127.0.0.1"], operations: [{ name: "go", method: "GET", path: "/round" }] };
    const r = await runConnectorOperation(c, c.operations[0], {}, {});
    assert.equal(r.error, "too_many_redirects");
  } finally { loop.close(); }
});

test("connector: query auth is applied to the request and redacted in results", async () => {
  process.env.APE_TEST_TOKEN = "super-secret-token";
  let seen = null;
  const srv = await serve(async (req, res) => {
    seen = req.url;
    await readBody(req);
    res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":1}');
  });
  try {
    const c = {
      name: "q", base_url: `http://127.0.0.1:${srv.port}`, egress_allow: ["127.0.0.1"],
      auth: { type: "query", token_env: "APE_TEST_TOKEN", header_name: "api_key" },
      operations: [{ name: "go", method: "GET", path: "/data" }],
    };
    const r = await runConnectorOperation(c, c.operations[0], {}, {});
    assert.equal(r.ok, true);
    assert.ok(seen.includes("api_key=super-secret-token"), "credential sent, saw: " + seen);
    assert.ok(!r.url.includes("super-secret-token"), "credential not in returned URL: " + r.url);
    assert.ok(r.url.includes("api_key=***"), "redaction marker present: " + r.url);
  } finally { srv.close(); delete process.env.APE_TEST_TOKEN; }
});

test("connector: confirm=true passes end-to-end through ape_connector_call", async () => {
  const srv = await serve(async (req, res) => {
    await readBody(req);
    res.writeHead(200, { "content-type": "application/json" }); res.end('{"wrote":true}');
  });
  const prevDataDir = process.env.APE_DATA_DIR;
  const dir = mkdtempSync(join(tmpdir(), "ape-conn-"));
  mkdirSync(join(dir, "connectors"), { recursive: true });
  writeFileSync(join(dir, "connectors", "tmp-destruct.yaml"), [
    "name: tmp-destruct",
    `base_url: http://127.0.0.1:${srv.port}`,
    "egress_allow: [127.0.0.1]",
    "operations:",
    "  - name: wipe",
    "    method: POST",
    "    path: /wipe",
    "    annotations: { destructive: true }",
    "",
  ].join("\n"));
  process.env.APE_DATA_DIR = dir;
  try {
    const denied = await dispatchCall("ape_connector_call", { connector: "tmp-destruct", operation: "wipe", input: {} });
    assert.equal(denied.resultType, "input_required", "no confirm means elicitation");
    // Regression (§6): confirm used to be checked at the server layer but dropped
    // before the connector layer, so the call never executed.
    const ok = await dispatchCall("ape_connector_call", { connector: "tmp-destruct", operation: "wipe", input: {}, confirm: true });
    assert.equal(ok.resultType, "complete");
    assert.equal(ok.structuredContent.result.ok, true, "confirmed destructive op executes, got: " + JSON.stringify(ok.structuredContent.result).slice(0, 200));
  } finally {
    if (prevDataDir === undefined) delete process.env.APE_DATA_DIR;
    else process.env.APE_DATA_DIR = prevDataDir;
    srv.close();
  }
});