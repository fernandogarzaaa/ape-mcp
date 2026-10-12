// Audit fix (Oct 2026): cost routing through freepool is opt-in. A free-tier
// key in the environment must not silently change which model serves
// provider:auto runs.
import test from "node:test";
import assert from "node:assert/strict";
import { costRoutingEnabled } from "../src/agent/freepool/costroute.js";

const auto = (policy = {}) => ({ model: { provider: "auto", id: "auto" }, policy });

test("cost routing is off by default, even with free-tier keys present", () => {
  assert.equal(costRoutingEnabled({ profile: auto(), env: { GROQ_API_KEY: "x", GEMINI_API_KEY: "y" } }), false);
  assert.equal(costRoutingEnabled({ profile: auto(), env: {} }), false);
  assert.equal(costRoutingEnabled({ profile: auto(), env: { APE_COST_ROUTING: "" } }), false);
});

test("opt in via APE_COST_ROUTING or policy.cost_routing", () => {
  for (const v of ["1", "true", "TRUE", "yes", "on", " 1 "]) {
    assert.equal(costRoutingEnabled({ profile: auto(), env: { APE_COST_ROUTING: v } }), true, v);
  }
  assert.equal(costRoutingEnabled({ profile: auto({ cost_routing: true }), env: {} }), true);
  assert.equal(costRoutingEnabled({ profile: auto({ cost_routing: "true" }), env: {} }), false, "only boolean true");
});

test("explicit opt-out and explicit choices win over opt-in", () => {
  const on = { APE_COST_ROUTING: "1" };
  for (const v of ["0", "false", "no", "off"]) {
    assert.equal(costRoutingEnabled({ profile: auto({ cost_routing: true }), env: { APE_COST_ROUTING: v } }), false, v);
  }
  assert.equal(costRoutingEnabled({ profile: auto({ routing: false }), env: on }), false);
  assert.equal(costRoutingEnabled({ profile: { model: { provider: "groq", id: "x" } }, env: on }), false);
  assert.equal(costRoutingEnabled({ profile: { model: {} }, env: on }), true, "missing provider means auto");
  assert.equal(costRoutingEnabled({ profile: auto(), opts: { provider: "openai" }, env: on }), false);
  assert.equal(costRoutingEnabled({ profile: auto(), opts: { model: "m" }, env: on }), false);
  assert.equal(costRoutingEnabled({ profile: auto(), opts: { mockScript: "s" }, env: on }), false);
  assert.equal(costRoutingEnabled({ profile: auto(), env: { ...on, APE_PROVIDER: "openai" } }), false);
  assert.equal(costRoutingEnabled({ profile: auto(), env: on, pinnedProvider: "anthropic" }), false);
});

test("credential allow-list must include freepool", () => {
  const on = { APE_COST_ROUTING: "1" };
  assert.equal(costRoutingEnabled({ profile: auto({ credential_policy: { allow: ["openai"] } }), env: on }), false);
  assert.equal(costRoutingEnabled({ profile: auto({ credential_policy: { allow: ["freepool"] } }), env: on }), true);
  assert.equal(costRoutingEnabled({ profile: auto({ credential_policy: { allow: [] } }), env: on }), true, "empty list = no restriction");
});

test("defaults: no args reads process.env and treats missing profile as auto", () => {
  const prev = process.env.APE_COST_ROUTING;
  delete process.env.APE_COST_ROUTING;
  try {
    assert.equal(costRoutingEnabled(), false);
    process.env.APE_COST_ROUTING = "1";
    const prevP = process.env.APE_PROVIDER; delete process.env.APE_PROVIDER;
    assert.equal(costRoutingEnabled({ profile: auto() }), true);
    if (prevP !== undefined) process.env.APE_PROVIDER = prevP;
  } finally {
    if (prev === undefined) delete process.env.APE_COST_ROUTING; else process.env.APE_COST_ROUTING = prev;
  }
});

test("tolerates a missing profile / policy / model", () => {
  const on = { APE_COST_ROUTING: "1" };
  assert.equal(costRoutingEnabled({ env: on }), true, "no profile = provider auto, no policy");
  assert.equal(costRoutingEnabled({ profile: {}, env: on }), true);
  assert.equal(costRoutingEnabled({ profile: { model: {} }, env: {} }), false);
  assert.equal(costRoutingEnabled({ profile: { policy: {} }, env: on }), true);
});
