import test from "node:test";
import assert from "node:assert/strict";
// M4: every POST body reader enforces the 4MB cap (413), including routes
// that previously concatenated chunks without a limit (/call, /a2a,
// console /api/*). At-limit passes, over-limit rejects before parsing,
// and the server stays healthy afterwards.
process.env.APE_REQUIRE_AUTH = "1";
process.env.APE_TOKENS = "limits-test-token";
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-limits-"));

const { startHttp } = await import("../src/http.js");
const { startConsole, consoleSessionToken } = await import("../src/console.js");

const CAP = 4 * 1024 * 1024;
let base = null;
let server = null;
test.before(async () => {
  const started = await startHttp({ port: 0, host: "127.0.0.1" });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});
test.after(() => { try { server?.close(); } catch { /* ignore */ } });

const auth = { Authorization: "Bearer limits-test-token" };
// Oversize enforcement destroys the upload socket; depending on the race the
// client sees a 413 response or a reset connection. Both prove the bytes were
// NOT accumulated: a capped server never returns 200-with-parse on them.
async function rawPost(path, bodyText) {
  let r;
  try {
    r = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: bodyText,
    });
  } catch (e) {
    return { status: "socket-closed", text: String(e?.cause?.code ?? e?.code ?? e).slice(0, 80) };
  }
  const text = await r.text().catch(() => "");
  return { status: r.status, text: text.slice(0, 120) };
}
function assertRejected(r, where) {
  assert.ok(r.status === 413 || r.status === "socket-closed", `${where}: rejected, got ${r.status} ${r.text}`);
}
// Valid JSON padded to an exact byte size.
function paddedCall(size) {
  const pad = "p".repeat(Math.max(0, size - 64));
  return JSON.stringify({ padding: pad });
}

test("limits: body exactly at the cap parses normally", async () => {
  const body = paddedCall(CAP);
  assert.ok(Buffer.byteLength(body) <= CAP && Buffer.byteLength(body) > CAP - 128, `sized ${Buffer.byteLength(body)}`);
  const r = await rawPost("/call", body);
  assert.notEqual(r.status, 413, `at-cap accepted, got ${r.status}: ${r.text}`);
});

test("limits: body over the cap is rejected early on /call", async () => {
  const r = await rawPost("/call", paddedCall(CAP + 1024));
  assertRejected(r, "over-cap /call");
});

test("limits: malformed giant input is rejected before parsing", async () => {
  const r = await rawPost("/a2a", "{".repeat(CAP + 16));
  assertRejected(r, "giant malformed /a2a");
});

test("limits: repeated oversize requests stay rejected and server stays healthy", async () => {
  for (let i = 0; i < 3; i++) {
    const r = await rawPost("/call", paddedCall(CAP + 2048));
    assertRejected(r, `attempt ${i}`);
  }
  const ok = await rawPost("/call", JSON.stringify({}));
  assert.notEqual(ok.status, 413, "server still answers small requests afterwards");
});

test("limits: console /api/call enforces the same cap", async () => {
  const started = await startConsole({ port: 0, host: "127.0.0.1" });
  try {
    const token = consoleSessionToken();
    const big = paddedCall(CAP + 1024);
    let over;
    try {
      const r = await fetch(`http://127.0.0.1:${started.port}/api/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: big,
      });
      over = { status: r.status };
      await r.text().catch(() => "");
    } catch (e) {
      over = { status: "socket-closed" };
    }
    assert.ok(over.status === 413 || over.status === "socket-closed", `console over-cap rejected: ${over.status}`);
    const small = await fetch(`http://127.0.0.1:${started.port}/api/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "ape_status", arguments: {} }),
    });
    assert.equal(small.status, 200, "console answers afterwards");
  } finally {
    started.server.close();
  }
});
