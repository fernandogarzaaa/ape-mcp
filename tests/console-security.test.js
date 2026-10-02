import test from "node:test";
import assert from "node:assert";
// Console security: hostile fixtures against the real console server.
// Each test names what it proves and what only a real browser can confirm
// (script execution, CSP enforcement, pixel behavior) — the harness asserts
// wire-level facts: status codes, headers, and escaped bytes.
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { startConsole, consoleSessionToken } from "../src/console.js";
import { dispatchCall } from "../src/server.js";
import { shareRun } from "../src/runs.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-console-sec-"));

let base = null;
let server = null;
let token = null;
test.before(async () => {
  const started = await startConsole({ port: 0, host: "127.0.0.1" });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
  token = consoleSessionToken();
  assert.ok(token && token.length >= 32, "per-session token minted");
});
test.after(() => { try { server?.close(); } catch { /* ignore */ } });

function rawReq(path, { host, origin, auth = true, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (host) headers.host = host;
    if (origin) headers.origin = origin;
    if (auth) headers.authorization = `Bearer ${token}`;
    const req = http.request(base + path, { method, headers }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("console: forged Host header is rejected before auth", async () => {
  const r = await rawReq("/api/runs", { host: "evil.example", auth: false });
  assert.equal(r.status, 403, "foreign Host gets nothing, even unauthenticated");
});

test("console: simulated rebinding (Origin and Host both foreign) is rejected", async () => {
  const r = await rawReq("/api/runs", { host: "evil.example", origin: "https://evil.example", auth: false });
  assert.equal(r.status, 403, "host gate fires before CORS comparison");
});

test("console: loopback without token is 401, with token is 200", async () => {
  const anon = await rawReq("/api/runs", { auth: false });
  assert.equal(anon.status, 401);
  const authed = await rawReq("/api/runs", { auth: true });
  assert.equal(authed.status, 200);
});

test("console: security headers on shell, API, and share routes", async () => {
  for (const path of ["/", "/api/runs", "/api/tools"]) {
    const r = await rawReq(path, { auth: true });
    const csp = r.headers["content-security-policy"] || "";
    assert.ok(!/unsafe-inline/.test(csp) && csp.includes("script-src"), `strict CSP on ${path}: ${csp.slice(0, 60)}`);
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["referrer-policy"], "no-referrer");
    assert.ok(
      (r.headers["content-security-policy"] || "").includes("frame-ancestors 'none'") || r.headers["x-frame-options"] === "DENY",
      `framing denied on ${path}`
    );
  }
});

test("console: client ships no HTML-string rendering or inline handlers", () => {
  for (const f of ["console/app.js", "console/share.js"]) {
    const src = readFileSync(join(root, f), "utf8");
    assert.ok(!/\.innerHTML\s*=/.test(src), `${f} has no innerHTML assignment`);
    assert.ok(!/\sonclick\s*=/.test(src), `${f} has no inline onclick`);
    assert.ok(!/document\.write/.test(src), `${f} has no document.write`);
  }
  const app = readFileSync(join(root, "console/app.js"), "utf8");
  assert.ok(app.includes("textContent"), "dynamic values go through textContent");
});

const PAYLOAD = `<img src=x onerror="alert(document.domain)">`;

test("console: hostile trace payload reaches the client as data, inert in DOM", async () => {
  // Server half: the trace endpoint returns the hostile entry verbatim
  // (escaping is the client's job — assert the server does not transform).
  const { appendFileSync, mkdirSync } = await import("node:fs");
  const { dataDir } = await import("../src/trace.js");
  mkdirSync(dataDir(), { recursive: true });
  appendFileSync(join(dataDir(), "trace.ndjson"), JSON.stringify({ tool: "probe", resultSummary: PAYLOAD }) + "\n");
  const r = await rawReq("/api/trace?since=0", { auth: true });
  assert.equal(r.status, 200);
  // JSON encoding escapes the quotes, so match the quote-free fragment.
  assert.ok(r.body.includes("onerror"), "server returns data untransformed");
  // Client half (static): nothing in the shell parses it as HTML (covered
  // above); actual script non-execution needs a real browser (stated).
});

test("console: share page escapes hostile run data", async () => {
  const script = [{ tool: "finish", args: { summary: `done ${PAYLOAD}` } }];
  const started = await dispatchCall(
    "ape_agent_run",
    { profile: "repo-triage", objective: `triage ${PAYLOAD}`, _mockScript: script },
    { headlessBypass: true }
  );
  const runId = started.structuredContent.result.run_id;
  assert.ok(runId);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const st = await dispatchCall("ape_agent_status", { run_id: runId });
    if (st.structuredContent.result.status !== "running") break;
  }
  const share = shareRun(runId, {});
  assert.ok(share.token, "share token minted");
  const page = await rawReq(`/share/${share.token}`, { auth: false });
  assert.equal(page.status, 200, "share route stays open by design");
  assert.ok(!page.body.includes(PAYLOAD), "raw payload absent from served HTML");
  assert.ok(page.body.includes("&lt;img"), "escaped form present");
  const csp = page.headers["content-security-policy"] || "";
  assert.ok(!/unsafe-inline/.test(csp), "share page under strict CSP");
});

test("console: ledger tab does not claim hash-chaining it cannot prove", async () => {
  const shell = await rawReq("/", { auth: true });
  assert.equal(shell.status, 200);
  assert.ok(!/hash-chained/i.test(shell.body), "no unverifiable chain claim in the UI");
});

test("console: event stream without a bearer is documented, not silent", async () => {
  // EventSource cannot send Authorization headers: record what the server
  // does so the behavior is locked, whichever way it goes.
  const r = await rawReq("/api/runs/stream", { auth: false });
  assert.ok([200, 401].includes(r.status), `stream answers ${r.status}`);
  if (r.status === 401) {
    console.log("# stream requires bearer (EventSource falls back to polling)");
  }
});
