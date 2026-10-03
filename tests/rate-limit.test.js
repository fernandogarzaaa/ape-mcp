import test from "node:test";
import assert from "node:assert/strict";
// M5: explicit trusted-proxy model + bounded sessions.
// - Direct clients cannot spoof the rate-limit identity via X-Forwarded-For.
// - XFF is honored only from a configured trusted proxy peer.
// - Sessions are capped (sweep-then-refuse) instead of growing unbounded.
process.env.APE_REQUIRE_AUTH = "1";
process.env.APE_TOKENS = "rl-test-token";
process.env.APE_RATE_LIMIT_RPM = "3";
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-rl-"));

const { startHttp, resetRateLimits, sweepSessions, mcpSessionCount, clientIp, MCP_SESSION_TTL_MS } = await import("../src/http.js");

let base = null;
let server = null;
test.before(async () => {
  const started = await startHttp({ port: 0, host: "127.0.0.1" });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});
test.after(() => { try { server?.close(); } catch { /* ignore */ } });

const auth = { Authorization: "Bearer rl-test-token" };
async function init(extraHeaders = {}) {
  const r = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth, ...extraHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, sid: r.headers.get("mcp-session-id"), json };
}

test("proxy: spoofed XFF from a direct client does not split buckets", async () => {
  delete process.env.APE_TRUSTED_PROXIES;
  resetRateLimits();
  // 6 requests, each with a different forged client IP: all must count
  // against the single socket identity → 429 from the 4th on.
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const r = await init({ "X-Forwarded-For": `10.9.9.${i}` });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses.slice(0, 3), [200, 200, 200], "first three pass");
  assert.ok(statuses.slice(3).every((s) => s === 429), `forged IPs share one bucket: ${statuses}`);
});

test("proxy: XFF honored only from a configured trusted proxy", async () => {
  process.env.APE_TRUSTED_PROXIES = "127.0.0.1,::ffff:127.0.0.1";
  try {
    resetRateLimits();
    // Distinct client IPs via the trusted proxy: separate buckets, no 429.
    for (let i = 0; i < 4; i++) {
      const r = await init({ "X-Forwarded-For": `10.8.8.${i}` });
      assert.equal(r.status, 200, `distinct client ${i} passes`);
    }
    // Same client 4 times through the proxy: 4th is limited.
    resetRateLimits();
    const same = [];
    for (let i = 0; i < 4; i++) same.push((await init({ "X-Forwarded-For": "10.8.8.99" })).status);
    assert.deepEqual(same, [200, 200, 200, 429], `same client limited: ${same}`);
  } finally {
    delete process.env.APE_TRUSTED_PROXIES;
  }
});

test("proxy: malformed XFF falls back to the socket peer", () => {
  delete process.env.APE_TRUSTED_PROXIES;
  const fake = (xff, remote) => clientIp({ headers: { "x-forwarded-for": xff }, socket: { remoteAddress: remote } });
  assert.equal(fake("", "10.1.2.3"), "10.1.2.3", "empty XFF -> socket");
  assert.equal(fake(",,,", "10.1.2.3"), "10.1.2.3", "blank XFF -> socket");
  assert.equal(fake("9.9.9.9", "10.1.2.3"), "10.1.2.3", "untrusted peer: XFF ignored");
  process.env.APE_TRUSTED_PROXIES = "10.1.2.3";
  try {
    assert.equal(fake("9.9.9.9, 8.8.8.8", "10.1.2.3"), "9.9.9.9", "trusted peer: leftmost wins");
    assert.equal(fake("9.9.9.9", "::ffff:10.1.2.3"), "9.9.9.9", "mapped peer form matches");
  } finally {
    delete process.env.APE_TRUSTED_PROXIES;
  }
});

test("sessions: minting past the ceiling is refused, sweep reclaims", async () => {
  sweepSessions(Date.now() + MCP_SESSION_TTL_MS + 1);
  assert.equal(mcpSessionCount(), 0, "sweep clears expired");
  process.env.APE_MAX_MCP_SESSIONS = "2";
  resetRateLimits();
  try {
    const a = await init();
    const b = await init();
    assert.ok(a.sid && b.sid && a.sid !== b.sid, "two sessions minted");
    assert.equal(mcpSessionCount(), 2);
    const c = await init();
    assert.equal(c.sid, null, "no session header past the ceiling");
    assert.equal(c.json?.error?.code, -32002, `honest limit error: ${JSON.stringify(c.json).slice(0, 120)}`);
    sweepSessions(Date.now() + MCP_SESSION_TTL_MS + 1);
    assert.equal(mcpSessionCount(), 0, "expired sessions reclaimed");
    resetRateLimits();
    const d = await init();
    assert.ok(d.sid, "minting works again after sweep");
  } finally {
    delete process.env.APE_MAX_MCP_SESSIONS;
  }
});
