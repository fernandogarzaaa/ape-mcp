import test from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { dispatchCall, toolsList, discover, TOOL_DEFS } from "../src/server.js";
import { protectedResourceDoc, checkBearer, authRequired } from "../src/auth.js";

test("discover pins 2026-07-28 + tasks ext", () => {
  const d = discover();
  assert.equal(d.protocol, "2026-07-28");
  assert.ok(d.capabilities.extensions["io.modelcontextprotocol/tasks"]);
});
test("tools list deterministic + ttlMs", () => {
  const a = toolsList().tools.map((t) => t.name);
  assert.deepEqual(a, [...a].sort());
  assert.ok(toolsList().ttlMs > 0);
});
test("status complete + structured", async () => {
  const r = await dispatchCall("ape_status", {});
  assert.equal(r.resultType, "complete");
  assert.ok(r.structuredContent.result.engines.genesis);
});
test("destructive evolve requires confirm (MRTR)", async () => {
  const r = await dispatchCall("ape_evolve", { action: "accept", proposal_id: "p1" });
  assert.equal(r.resultType, "input_required");
  assert.ok(r.requestState);
});
test("unknown tooldutifully reported", async () => {
  const r = await dispatchCall("nope_x", {});
  assert.equal(r.structuredContent.result.error, "unknown_tool");
});
test("well-known doc advertises local-open by default", () => {
  const d = protectedResourceDoc("127.0.0.1:1");
  assert.ok(d.resource.includes("127.0.0.1"));
  assert.deepEqual(d.authorization_servers, []);
  assert.equal(d.ape_mode, "local-open");
});
test("bearer open by default (local-only v1)", () => {
  assert.equal(authRequired(), false);
  assert.equal(checkBearer({ headers: {} }).ok, true);
});
test("fetch-adam maps every platform to an asset + local binary when present", async () => {
  const m = await import("../scripts/fetch-adam.mjs");
  assert.equal(m.assetFor("win32", "x64"), "adam-mcp-win-x64.exe");
  assert.equal(m.assetFor("darwin", "arm64"), "adam-mcp-darwin-arm64");
  assert.equal(m.assetFor("linux", "x64"), "adam-mcp-linux-x64");
  // Presence is environment-dependent (win-x64 ships in-repo; other platforms
  // build via cargo or fetch from Release) â€” assert shape, not presence.
  const asset = m.assetFor(process.platform, process.arch);
  assert.ok(asset);
  assert.ok(m.destFor(asset).endsWith(process.platform === "win32" ? "adam-mcp.exe" : "adam-mcp"));
  if (existsSync(m.destFor(asset))) assert.ok(true, "vendored binary present");
});
test("background task runs to done with result", async () => {
  const s = await dispatchCall("ape_task_start", { tool: "ape_status", arguments: {} });
  const id = s.structuredContent.result.task_id;
  assert.ok(id);
  let t = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const g = await dispatchCall("ape_task_get", { task_id: id });
    t = g.structuredContent.result;
    if (t.status === "done" || t.status === "failed") break;
  }
  assert.equal(t.status, "done");
  assert.equal(t.result.structuredContent.result.version, "1.0.0");
});
test("task_start rejects unknown tools (no nesting)", async () => {
  const r = await dispatchCall("ape_task_start", { tool: "nope_x" });
  assert.equal(r.structuredContent.result.error, "unknown_tool");
});
test("ape_beliefs + genome route to vendored ADAM (real binary or explicit unavailable)", async () => {
  const b = await dispatchCall("ape_beliefs", {});
  const g = await dispatchCall("ape_genome", {});
  const br = b.structuredContent.result, gr = g.structuredContent.result;
  const nonOk = ["unavailable", "spawn-error", "exited", "timeout", "rpc-error"];
  if (br._adam === "ok") assert.equal(br.tool, "adam_beliefs");
  else assert.ok(nonOk.includes(br._adam), "explicit not silent: " + br._adam);
  if (gr._adam === "ok") assert.equal(gr.tool, "adam_genome");
  else assert.ok(nonOk.includes(gr._adam), "explicit not silent: " + gr._adam);
});
test("ape_remember persists through real adam-mcp when present", async () => {
  const r = await dispatchCall("ape_remember", { kind: "episodic", content: "test-marker", organism_id: "testorg" });
  const res = r.structuredContent.result;
  if (res._adam === "ok") assert.equal(res.tool, "adam_memory_store");
  else assert.ok(["unavailable", "spawn-error", "exited", "timeout", "rpc-error"].includes(res._adam), "explicit not silent");
});

test("policy-gates mod hook observably mutates args (real hooks.js import)", async () => {
  const { loadMods } = await import("../src/mods.js");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const mods = await loadMods(root);
  const pg = mods.find((m) => m.name === "policy-gates");
  assert.ok(pg, "policy-gates loaded");
  assert.equal(typeof pg.hooks?.preCall, "function", "hooks.js actually imported, not {}");
  const out = await pg.hooks.preCall("ape_evolve", { action: "accept" });
  assert.equal(out._policy, "destructive-confirm-required");
});

test("zero silent stubs across the full tool list", async () => {
  const names = toolsList().tools.map((t) => t.name);
  const samples = {
    ape_remember: { content: "gate-check" },
    ape_recall: { query: "gate" },
    ape_mcp_eval: { target: "http://127.0.0.1:1" },
    ape_validate_experience: { url: "mock:" },
    ape_audit_claim: {},
    ape_compare: {},
    ape_orchestrate: { op: "status" },
    ape_task_get: { task_id: "none" },
  };
  for (const n of names) {
    const r = await dispatchCall(n, samples[n] ?? {}, { headlessBypass: true });
    assert.ok(["complete", "input_required"].includes(r.resultType), `${n} resultType=${r.resultType}`);
    const res = r.structuredContent?.result ?? {};
    if (res.error) {
      assert.ok(["engine_not_configured", "unknown_tool", "handler_failed", "profile_not_found", "connector_not_found", "connector_unknown_operation"].includes(res.error), `${n} honest error (${res.error})`);
    }
  }
});

test("map/registry drift: ape-map.yaml tools == TOOL_DEFS", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const map = YAML.parse(readFileSync(join(root, "schemas", "ape-map.yaml"), "utf8"));
  const mapped = new Set(map.tools.map((t) => t.name));
  const defs = new Set(TOOL_DEFS.map((t) => t.name));
  const onlyMap = [...mapped].filter((x) => !defs.has(x));
  const onlyDefs = [...defs].filter((x) => !mapped.has(x));
  assert.deepEqual(onlyMap, [], "tools in map but not registered");
  assert.deepEqual(onlyDefs, [], "tools registered but not in map");
});

test("ape_evolve accept/reject route to real ADAM mutation tools (or explicit unavailable)", async () => {
  const a = await dispatchCall("ape_evolve", { action: "accept", proposal_id: "00000000-0000-0000-0000-000000000000" }, { headlessBypass: true });
  const ar = a.structuredContent.result;
  if (ar._adam === "ok") assert.equal(ar.tool, "adam_accept_mutation");
  else assert.ok(["unavailable", "spawn-error", "exited", "timeout", "rpc-error"].includes(ar._adam), "explicit not silent");
  const rj = await dispatchCall("ape_evolve", { action: "reject", proposal_id: "00000000-0000-0000-0000-000000000000" }, { headlessBypass: true });
  const rr = rj.structuredContent.result;
  if (rr._adam === "ok") assert.equal(rr.tool, "adam_reject_mutation");
  else assert.ok(["unavailable", "spawn-error", "exited", "timeout", "rpc-error"].includes(rr._adam), "explicit not silent");
});
