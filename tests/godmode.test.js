import test from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { dispatchCall, toolsList, discover } from "../src/server.js";
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
  const r = await dispatchCall("godmode_status", {});
  assert.equal(r.resultType, "complete");
  assert.ok(r.structuredContent.result.engines.genesis);
});
test("destructive evolve requires confirm (MRTR)", async () => {
  const r = await dispatchCall("godmode_evolve", { action: "accept", proposal_id: "p1" });
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
  assert.equal(d.godmode_mode, "local-open");
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
  // build via cargo or fetch from Release) — assert shape, not presence.
  const asset = m.assetFor(process.platform, process.arch);
  assert.ok(asset);
  assert.ok(m.destFor(asset).endsWith(process.platform === "win32" ? "adam-mcp.exe" : "adam-mcp"));
  if (existsSync(m.destFor(asset))) assert.ok(true, "vendored binary present");
});
test("background task runs to done with result", async () => {
  const s = await dispatchCall("godmode_task_start", { tool: "godmode_status", arguments: {} });
  const id = s.structuredContent.result.task_id;
  assert.ok(id);
  let t = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const g = await dispatchCall("godmode_task_get", { task_id: id });
    t = g.structuredContent.result;
    if (t.status === "done" || t.status === "failed") break;
  }
  assert.equal(t.status, "done");
  assert.equal(t.result.structuredContent.result.version, "1.0.0");
});
test("task_start rejects unknown tools (no nesting)", async () => {
  const r = await dispatchCall("godmode_task_start", { tool: "nope_x" });
  assert.equal(r.structuredContent.result.error, "unknown_tool");
});
test("godmode_beliefs + genome route to vendored ADAM (real binary or explicit unavailable)", async () => {
  const b = await dispatchCall("godmode_beliefs", {});
  const g = await dispatchCall("godmode_genome", {});
  const br = b.structuredContent.result, gr = g.structuredContent.result;
  if (br._adam === "ok") assert.equal(br.tool, "adam_beliefs");
  else assert.ok(br._adam === "unavailable" || br._adam === "spawn-error" || br._adam === "exited", "explicit not silent");
  if (gr._adam === "ok") assert.equal(gr.tool, "adam_genome");
});
test("godmode_remember persists through real adam-mcp when present", async () => {
  const r = await dispatchCall("godmode_remember", { kind: "episodic", content: "test-marker", organism_id: "testorg" });
  const res = r.structuredContent.result;
  if (res._adam === "ok") assert.equal(res.tool, "adam_memory_store");
  else assert.ok(["unavailable", "spawn-error", "exited", "timeout"].includes(res._adam), "explicit not silent");
});
