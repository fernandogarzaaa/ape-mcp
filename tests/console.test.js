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
    const resp = await fetch(base + "api/runs/stream?since_step=0");
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

test.after(() => { try { server?.close(); } catch { /* ignore */ } });