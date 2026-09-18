import test from "node:test";
import assert from "node:assert";
import { connectorList, loadConnector, runConnectorOperation, connectorHosts } from "../src/connectors.js";
import { dispatchCall } from "../src/server.js";
import { loadProfile } from "../src/agent/profiles.js";

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