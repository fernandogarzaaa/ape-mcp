import test from "node:test";
import assert from "node:assert";
import { startConsole } from "../src/console.js";

let base = null;
let server = null;

test("console: boots and serves new observability endpoints", async () => {
  const started = await startConsole({ port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}/`;
  const get = async (p) => (await (await fetch(base + p)).json());

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

  const bad = await (await fetch(base + "api/profile?name=../evil")).json();
  assert.ok(bad.error, "path traversal rejected");
});

test("console: profile save validates and round-trips", async () => {
  const yaml = "name: console-test-profile\ndescription: test\nmodel:\n  provider: mock\n  id: mock-model\nsystem: hi\ntools:\n  - builtin: finish\nlimits:\n  max_steps: 2\n";
  const r = await (await fetch(base + "api/profile/save", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "console-test-profile", yaml }),
  })).json();
  assert.equal(r.ok, true);
  const back = await (await fetch(base + "api/profile?name=console-test-profile")).json();
  assert.ok(back.yaml.includes("console-test-profile"));

  const badYaml = await (await fetch(base + "api/profile/save", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "bad", yaml: "name: bad\nno-model-here: true\n" }),
  })).json();
  assert.ok(badYaml.error, "invalid profile rejected");

  const badName = await (await fetch(base + "api/profile/save", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "../../evil", yaml }),
  })).json();
  assert.ok(badName.error, "bad name rejected");
});

test("console: connector save validates", async () => {
  const yaml = "name: console-test-conn\ndescription: test\nbase_url: https://example.com\negress_allow: [example.com]\noperations:\n  - name: ping\n    method: GET\n    path: /ping\n";
  const r = await (await fetch(base + "api/connector/save", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "console-test-conn", yaml }),
  })).json();
  assert.equal(r.ok, true);
});

test.after(() => { try { server?.close(); } catch { /* ignore */ } });