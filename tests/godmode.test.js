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
test("fetch-adam maps this platform to vendored binary", async () => {
  const m = await import("../scripts/fetch-adam.mjs");
  const asset = m.assetFor(process.platform, process.arch);
  assert.ok(asset);
  assert.ok(existsSync(m.destFor(asset)));
});
