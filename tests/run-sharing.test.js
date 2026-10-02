import test from "node:test";
import assert from "node:assert";
import { createHash } from "node:crypto";
// Phase-3 hermetic tests: run share links (ape_agent_share / ape_agent_unshare)
// plus the console web-serving surface (/share/<token>, token-scoped SSE,
// APE_CONSOLE_HOST / APE_CONSOLE_TOKEN, ?run_id= stream filter).
// Test workers are $0 mock forks sharing one ledger DB across parallel test
// processes; raise the production concurrency guard so scheduling luck can't
// flake worker-fork tests (the daily spend ceiling still applies).
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
// W-4: test-only mock-input flag (production servers strip _mockScript).
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { dispatchCall, agentMethod, parseRunRef } from "../src/server.js";
import { createRun, updateRun, appendStep, getRun, resolveShareToken } from "../src/runs.js";
import { DatabaseSync } from "../src/sqlite.js";
import { runsDbPath } from "../src/runs.js";
import { startConsole } from "../src/console.js";

const R = (out) => out.structuredContent.result;
const now = () => new Date().toISOString();
// Unique marker so rows from other test files / earlier runs can't pollute
// assertions; the shared ledger persists across suite runs.
const tag = `sharetest-${process.pid}`;

function makeRun(objectiveSuffix) {
  const id = createRun({ profile: "repo-triage", model: "mock/mock", objective: `${tag} ${objectiveSuffix}` });
  appendStep(id, { step: 0, kind: "model", tool: null, durationMs: 12, tokens: 10, cost: 0.0001, resultSummary: `${tag} plan step` });
  appendStep(id, { step: 1, kind: "tool", tool: "finish", durationMs: 3, tokens: 5, cost: 0.00005, resultSummary: `${tag} done summary` });
  updateRun(id, { status: "done", stop_reason: "explicit_final_answer", finished_at: now(), total_cost: 0.00015, total_tokens: 15, step_count: 2, receipt: JSON.stringify({ verdict: "pass", tag }) });
  return id;
}

function dbHashes(runId) {
  const db = new DatabaseSync(runsDbPath(), { readOnly: true });
  try {
    return db.prepare("SELECT token_hash, run_id, revoked_at, label FROM run_shares WHERE run_id = ?").all(runId);
  } finally {
    db.close();
  }
}

test("share: mint returns token + URL; raw token is never persisted", async () => {
  const id = makeRun("mint");
  // Pin the console port env so the minted URL is deterministic regardless of
  // the shared <dataDir>/console.port written by parallel test processes.
  const prevPort = process.env.APE_CONSOLE_PORT;
  process.env.APE_CONSOLE_PORT = "18777";
  try {
    const s = R(await dispatchCall("ape_agent_share", { run_id: id, label: "demo link" }));
    assert.ok(!s.error, `unexpected error: ${JSON.stringify(s)}`);
    assert.equal(s.run_id, id);
    assert.match(s.token, /^[0-9a-f]{64}$/, "token is 32 random bytes as hex");
    assert.equal(s.url, `http://127.0.0.1:18777/share/${s.token}`, "url embeds the token");
    assert.equal(s.label, "demo link");
    assert.ok(s.created_at);

    // Canonical URI form also resolves.
    const viaUri = R(await dispatchCall("ape_agent_share", { run_id: `ape://runs/${id}` }));
    assert.equal(viaUri.run_id, id, "ape://runs/<id> accepted");

    // Raw token must never be in the ledger: only its SHA-256 hash is stored.
    const rows = dbHashes(id);
    assert.ok(rows.length >= 2, "both minted shares recorded");
    const expected = createHash("sha256").update(s.token, "utf8").digest("hex");
    const row = rows.find((r) => r.token_hash === expected);
    assert.ok(row, "hash of the raw token is the stored key");
    assert.ok(!rows.some((r) => r.token_hash === s.token), "raw token is not persisted");
    assert.equal(row.revoked_at, null, "fresh share is live");
  } finally {
    if (prevPort === undefined) delete process.env.APE_CONSOLE_PORT;
    else process.env.APE_CONSOLE_PORT = prevPort;
    await dispatchCall("ape_agent_unshare", { run_id: id, all: true });
  }
});

test("share: unknown run returns honest run_not_found", async () => {
  const s = R(await dispatchCall("ape_agent_share", { run_id: "run-does-not-exist" }));
  assert.equal(s.error, "run_not_found");
  const u = R(await dispatchCall("ape_agent_unshare", { run_id: "run-does-not-exist", all: true }));
  assert.equal(u.error, "run_not_found");
});

test("unshare: revoke one token, wrong token, missing args, revoke all", async () => {
  const id = makeRun("revoke");
  try {
    const a = R(await dispatchCall("ape_agent_share", { run_id: id }));
    const b = R(await dispatchCall("ape_agent_share", { run_id: id }));
    // Wrong token for this run -> honest error, nothing revoked.
    const wrong = R(await dispatchCall("ape_agent_unshare", { run_id: id, token: "0".repeat(64) }));
    assert.equal(wrong.error, "share_not_found");
    // Neither token nor all -> missing_args.
    const missing = R(await dispatchCall("ape_agent_unshare", { run_id: id }));
    assert.equal(missing.error, "missing_args");
    // Revoke exactly one.
    const one = R(await dispatchCall("ape_agent_unshare", { run_id: id, token: a.token }));
    assert.equal(one.revoked, 1);
    assert.equal(resolveShareToken(a.token), null, "revoked token no longer resolves");
    assert.ok(resolveShareToken(b.token), "other token for the same run still live");
    // Revoking it again is an honest miss, not a crash.
    const again = R(await dispatchCall("ape_agent_unshare", { run_id: id, token: a.token }));
    assert.equal(again.error, "share_not_found");
    // Revoke everything left.
    const all = R(await dispatchCall("ape_agent_unshare", { run_id: id, all: true }));
    assert.equal(all.revoked, 1);
    assert.equal(resolveShareToken(b.token), null, "all tokens revoked");
  } finally {
    await dispatchCall("ape_agent_unshare", { run_id: id, all: true });
  }
});

test("extension parity: agent/share and agent/unshare", async () => {
  const id = makeRun("extension");
  try {
    const s = await agentMethod("agent/share", { run_id: id, label: "ext" });
    assert.match(s.token, /^[0-9a-f]{64}$/);
    assert.ok(resolveShareToken(s.token), "token resolves");
    const u = await agentMethod("agent/unshare", { run_id: id, token: s.token });
    assert.equal(u.revoked, 1);
  } finally {
    await agentMethod("agent/unshare", { run_id: id, all: true });
  }
});

test("share: parseRunRef accepts canonical ape://runs/<id>", () => {
  assert.equal(parseRunRef("ape://runs/run-xyz"), "run-xyz");
});

// --- HTTP surface: real console server, real share URLs ---

let base = null;
let server = null;

test("console: share page serves the run's timeline without auth; 404s leak nothing", async () => {
  const started = await startConsole({ port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}/`;
  // Pin the port so ape_agent_share mints absolute URLs against this server.
  process.env.APE_CONSOLE_PORT = String(started.port);
  assert.equal(started.host, "127.0.0.1", "console binds loopback by default");

  const idA = makeRun("http-a");
  const idB = makeRun("http-b");
  try {
    const s = R(await dispatchCall("ape_agent_share", { run_id: idA, label: "http page" }));
    const page = await (await fetch(`${base}share/${s.token}`)).text();
    const res = await fetch(`${base}share/${s.token}`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type").includes("text/html"));
    assert.ok(page.includes(idA), "page shows the shared run");
    assert.ok(page.includes(`${tag} done summary`), "page shows the run's steps");
    assert.ok(page.includes("pass"), "page shows the receipt");
    assert.ok(page.includes("http page"), "page shows the label");
    assert.ok(!page.includes(idB), "page never exposes other runs");
    assert.ok(!page.includes("/api/"), "chromeless page links no console APIs");

    // Unknown and malformed tokens 404 without run details.
    for (const bad of ["0".repeat(64), "not-a-token"]) {
      const r = await fetch(`${base}share/${bad}`);
      assert.equal(r.status, 404, `/${bad} -> 404`);
      const body = await r.json();
      assert.equal(body.error, "share_not_found");
      assert.ok(!JSON.stringify(body).includes(idA), "404 leaks no run details");
    }
    // Path traversal normalizes away from /share/* and hits the bearer gate
    // (401 without a token) — either way it never reaches share logic.
    const trav = await fetch(`${base}share/../evil`);
    assert.ok([401, 404].includes(trav.status), `traversal -> 401/404, got ${trav.status}`);

    // Token-scoped SSE stream works without the console bearer.
    const ctrl = new AbortController();
    const stream = await fetch(`${base}share/${s.token}/stream`, { signal: ctrl.signal });
    assert.equal(stream.status, 200);
    assert.ok(stream.headers.get("content-type").includes("text/event-stream"));
    ctrl.abort();
    const badStream = await fetch(`${base}share/${"0".repeat(64)}/stream`);
    assert.equal(badStream.status, 404);

    // Revoke -> the same URL 404s.
    const un = R(await dispatchCall("ape_agent_unshare", { run_id: idA, token: s.token }));
    assert.equal(un.revoked, 1);
    const gone = await fetch(`${base}share/${s.token}`);
    assert.equal(gone.status, 404);
    const goneStream = await fetch(`${base}share/${s.token}/stream`);
    assert.equal(goneStream.status, 404);
  } finally {
    await dispatchCall("ape_agent_unshare", { run_id: idA, all: true });
    await dispatchCall("ape_agent_unshare", { run_id: idB, all: true });
  }
});

test("console: APE_CONSOLE_TOKEN gates /api/* but share routes stay open", async () => {
  process.env.APE_CONSOLE_TOKEN = "test-console-token-abc123";
  try {
    const id = makeRun("authed");
    try {
      const s = R(await dispatchCall("ape_agent_share", { run_id: id }));

      const noAuth = await fetch(`${base}api/runs`);
      assert.equal(noAuth.status, 401, "/api/* without bearer -> 401");
      const wwwAuth = noAuth.headers.get("www-authenticate") || "";
      assert.ok(wwwAuth.includes("Bearer"), "401 carries a Bearer challenge");

      const wrongAuth = await fetch(`${base}api/runs`, { headers: { Authorization: "Bearer wrong" } });
      assert.equal(wrongAuth.status, 401, "wrong bearer -> 401");

      const authed = await fetch(`${base}api/runs`, { headers: { Authorization: "Bearer test-console-token-abc123" } });
      assert.equal(authed.status, 200, "/api/* with bearer -> 200");
      const body = await authed.json();
      assert.ok(Array.isArray(body.runs), "authed /api/runs returns runs");

      // Share routes stay accessible without the console bearer.
      const page = await fetch(`${base}share/${s.token}`);
      assert.equal(page.status, 200, "share page 200 without bearer");
      const pageText = await page.text();
      assert.ok(pageText.includes(id), "share page still shows the run");

      // ?run_id= filters the SSE stream to one run.
      const idOther = makeRun("authed-other");
      try {
        const ctrl = new AbortController();
        const streamRes = await fetch(`${base}api/runs/stream?run_id=${id}`, {
          headers: { Authorization: "Bearer test-console-token-abc123" },
          signal: ctrl.signal,
        });
        assert.equal(streamRes.status, 200);
        assert.ok(streamRes.headers.get("content-type").includes("text/event-stream"));
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let chunk = "";
        const deadline = Date.now() + 8000;
        try {
          while (Date.now() < deadline) {
            const { value, done } = await Promise.race([
              reader.read(),
              new Promise((_, rej) => setTimeout(() => rej(new Error("sse timeout")), 8000)),
            ]);
            if (done) break;
            chunk += decoder.decode(value ?? new Uint8Array(), { stream: true });
            if (chunk.includes("event: run") && chunk.includes(id)) break;
          }
        } finally {
          ctrl.abort();
        }
        assert.ok(chunk.includes(id), "filtered stream carries the requested run");
        assert.ok(!chunk.includes(idOther), "filtered stream omits other runs");
      } finally {
        await dispatchCall("ape_agent_unshare", { run_id: idOther, all: true });
      }

      // /api SSE without bearer is also gated.
      const ctrl2 = new AbortController();
      const gated = await fetch(`${base}api/runs/stream`, { signal: ctrl2.signal });
      assert.equal(gated.status, 401, "/api SSE without bearer -> 401");
      ctrl2.abort();
    } finally {
      await dispatchCall("ape_agent_unshare", { run_id: id, all: true });
    }
  } finally {
    delete process.env.APE_CONSOLE_TOKEN;
  }
});

test("console: closes", async () => {
  delete process.env.APE_CONSOLE_PORT;
  if (server) {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
  server = null;
});
