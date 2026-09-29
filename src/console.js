import { createServer } from "node:http";
import { readFileSync, existsSync, readFileSync as r, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import YAML from "yaml";
import { dispatchCall, toolsList, discover } from "./server.js";
import { dispatch } from "./dispatch.js";
import { taskList, taskGet } from "./tasks.js";
import { loadMods } from "./mods.js";
import { dataDir } from "./trace.js";
import { listRuns, getRun, runningCount, spendSince, stepsSince, maxStepId, resolveShareToken, consolePortFile } from "./runs.js";
import { connectorList } from "./connectors.js";
import { listProfiles, describeProfile, loadProfile } from "./agent/profiles.js";
import { protectedResourceDoc, checkBearer } from "./auth.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PROFILE_TEMPLATE = `name: my-agent
description: What this agent does, in one line.
model:
  provider: auto          # auto | anthropic | openai | openrouter | groq | nebius | local | mock
  id: auto                # auto = provider default, or pin an explicit model id
system: |
  You are a careful agent. Always call memory.recall before proposing.
  Never claim work is done without evidence from a verify step.
  When finished, call finish with a summary.
tools:                    # what the agent may call inside its loop
  - builtin: memory.recall
  - builtin: memory.store
  - builtin: finish       # terminal: call finish(summary) when done
  # - engine: skein.orchestrate
  # - engine: genesis.audit_claim
  # - engine: eve.validate_experience
  # - connector: web
limits:
  max_steps: 12
  max_tokens: 120000
  max_wall_seconds: 300
  max_usd: 0.50
  max_destructive: 1
  max_repeats: 3
policy:
  destructive: deny      # deny (default) | allow — allow is still capped + audited
  verify_before_finish: warn  # warn (default) | enforce | off
stop_conditions:
  - no_tool_call_in_step
  - explicit_final_answer
  - budget_exhausted
`;

const CONNECTOR_TEMPLATE = `name: my_api
description: What this connector reaches, in one line.
base_url: https://api.example.com
auth:
  type: bearer            # bearer | header | query | none
  token_env: MY_API_TOKEN # env var NAME only — never the value
egress_allow: [api.example.com]   # enforced: requests elsewhere are refused
operations:
  - name: list_things
    method: GET
    path: /v1/things
    query:
      per_page: { from: per_page, default: 20 }
    input_schema:
      type: object
      properties:
        per_page: { type: number }
    annotations: { readOnly: true, idempotent: true }
  # - name: create_thing
  #   method: POST
  #   path: /v1/things
  #   body:
  #     name: { from: name }
  #   input_schema:
  #     type: object
  #     required: [name]
  #     properties:
  #       name: { type: string }
  #   annotations: { readOnly: false, destructive: true }  # needs confirm
`;

// Console bearer: APE_CONSOLE_TOKEN wins when set (every /api/* route needs
// Authorization: Bearer <token>); otherwise the shared APE_REQUIRE_AUTH /
// APE_TOKENS gate applies (open by default on loopback).
function checkConsoleBearer(req) {
  const tok = process.env.APE_CONSOLE_TOKEN;
  if (tok) {
    const hdr = String(req.headers["authorization"] || "");
    const given = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
    const a = Buffer.from(given, "utf8");
    const b = Buffer.from(tok, "utf8");
    return { ok: a.length === b.length && timingSafeEqual(a, b) };
  }
  return checkBearer(req);
}

function consoleUnauthorized(res) {
  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": 'Bearer realm="ape-console"',
  });
  const src = process.env.APE_CONSOLE_TOKEN ? "APE_CONSOLE_TOKEN" : "APE_TOKENS (with APE_REQUIRE_AUTH=1)";
  res.end(JSON.stringify({ error: "unauthorized", hint: `Set Authorization: Bearer <token from ${src}>` }));
}

function isLoopbackHost(h) {
  return ["127.0.0.1", "::1", "localhost"].includes(String(h || "").toLowerCase());
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Chromeless single-run page for share links: this run's status, steps, and
// receipt only. It never queries or links to other runs, the console shell,
// or any /api/* route — the only fetch it makes is its own token-scoped
// stream (relative URL), so there is no bearer token to leak.
function renderSharePage(run, share) {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const rows = steps.map((s) => `<tr><td>${escHtml(s.step)}</td><td>${escHtml(s.kind)}</td><td>${escHtml(s.tool)}</td><td>${escHtml(s.duration_ms)}</td><td>${escHtml(Number(s.cost ?? 0).toFixed(6))}</td><td>${escHtml(s.result_summary ?? "")}</td></tr>`).join("");
  let receipt = null;
  if (run.receipt) {
    try { receipt = JSON.stringify(JSON.parse(run.receipt), null, 2).slice(0, 8000); }
    catch { receipt = String(run.receipt).slice(0, 8000); }
  }
  const title = share.label ? `${share.label} — shared run` : "Shared APE run";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fafafa}
.badge{display:inline-block;padding:.2rem .6rem;border-radius:999px;background:#e8e8e8;font-weight:600}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.5rem 1.5rem;margin:1rem 0}
.meta div span{color:#666;font-size:.8rem;display:block}
table{width:100%;border-collapse:collapse;font-size:.85rem;background:#fff}
th,td{border:1px solid #ddd;padding:.4rem .5rem;text-align:left;vertical-align:top}
th{background:#f0f0f0}
pre{background:#111;color:#d6f5d6;padding:1rem;overflow:auto;font-size:.8rem}
footer{margin-top:2rem;color:#888;font-size:.75rem}
</style></head>
<body>
<h1>${escHtml(title)}</h1>
<p><span class="badge" id="run-status">${escHtml(run.status)}</span>
outcome: <strong>${escHtml(run.outcome_status ?? "")}</strong></p>
<div class="meta">
<div><span>run</span><code>${escHtml(run.run_id)}</code></div>
<div><span>profile</span>${escHtml(run.profile)}</div>
<div><span>model</span>${escHtml(run.model ?? "")}</div>
<div><span>objective</span>${escHtml((run.objective ?? "").slice(0, 200))}</div>
<div><span>started</span>${escHtml(run.started_at ?? "")}</div>
<div><span>finished</span>${escHtml(run.finished_at ?? "")}</div>
<div><span>stop reason</span>${escHtml(run.stop_reason ?? "")}</div>
<div><span>steps</span>${escHtml(steps.length)} &nbsp; <span>cost</span>$${escHtml(Number(run.total_cost ?? 0).toFixed(4))}</div>
<div><span>tokens</span>${escHtml(run.total_tokens ?? 0)}</div>
<div><span>shared</span>${escHtml(share.created_at ?? "")}</div>
</div>
<h2>Steps</h2>
<table><thead><tr><th>#</th><th>kind</th><th>tool</th><th>ms</th><th>cost</th><th>summary</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">no steps recorded yet</td></tr>'}</tbody></table>
${receipt ? `<h2>Receipt</h2><pre>${escHtml(receipt)}</pre>` : ""}
<footer>Read-only share link. It shows this run only and expires when the operator revokes it.</footer>
<script>
(function () {
  var es;
  try { es = new EventSource("stream"); } catch (e) { return; }
  var rt = null;
  function reloadSoon() {
    if (rt) return;
    rt = setTimeout(function () { location.reload(); }, 1500);
  }
  es.addEventListener("step", reloadSoon);
  es.addEventListener("run", function (e) {
    try {
      var r = JSON.parse(e.data);
      var el = document.getElementById("run-status");
      if (el && r.status) el.textContent = r.status;
      if (r.status && r.status !== "running") { es.close(); setTimeout(function () { location.reload(); }, 800); }
      else reloadSoon();
    } catch (err) { reloadSoon(); }
  });
})();
</script>
</body></html>`;
}

// GET /share/<token>: 200 with the run's page, or 404 that leaks nothing about
// which runs exist. Never logs or echoes the raw token.
function serveSharePage(res, token) {
  const share = resolveShareToken(token);
  if (!share) {
    res.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ error: "share_not_found" }));
  }
  const run = getRun(share.run_id);
  if (run.status === "not_found") {
    res.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ error: "share_not_found" }));
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(renderSharePage(run, share));
}

// Server-sent events with an optional run_id filter. Unfiltered (the console's
// /api/runs/stream) behaves exactly as before. Filtered streams (share view)
// skip the global spend event: a share sees its run's status and steps only.
// For share streams the cursor starts at "now" — the page already rendered
// history server-side, and replaying it would just trigger reloads.
function serveRunStream(req, res, url, onlyRunId) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  let lastStepId = onlyRunId ? maxStepId() : Number(url.searchParams.get("since_step") || 0);
  let lastStatuses = new Map();
  let alive = true;
  req.on("close", () => { alive = false; clearInterval(timer); });
  const send = (event, data) => {
    if (!alive) return false;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); return true; }
    catch { alive = false; return false; }
  };
  const tick = () => {
    if (!alive) return;
    try {
      // New/changed runs.
      const runs = listRuns(50).filter((r) => !onlyRunId || r.run_id === onlyRunId);
      for (const r of runs) {
        const prev = lastStatuses.get(r.run_id);
        if (prev === undefined || prev !== r.status) {
          lastStatuses.set(r.run_id, r.status);
          if (!send("run", r)) return;
        }
      }
      // New steps.
      const steps = stepsSince(lastStepId, 100).filter((s) => !onlyRunId || s.run_id === onlyRunId);
      for (const s of steps) {
        lastStepId = Math.max(lastStepId, s.id);
        if (!send("step", s)) return;
      }
      if (!onlyRunId) {
        // Spend (cheap; drives the header strip live).
        const dailyCap = Number(process.env.APE_MAX_DAILY_USD ?? 25);
        const maxConcurrent = Number(process.env.APE_MAX_CONCURRENT_RUNS ?? 4);
        send("spend", {
          today_usd: spendSince(Date.now() - 86400000),
          daily_cap_usd: dailyCap,
          running: runningCount(),
          max_concurrent: maxConcurrent,
        });
      }
      res.write(": ping\n\n");
    } catch { /* next tick */ }
  };
  const timer = setInterval(tick, 1000);
  tick();
}

export function startConsole({ port = 0, open = false, host } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const host = req.headers.host || "127.0.0.1";
    // CORS: same-origin only. The console shell calls its own origin; browsers
    // must never read this loopback service cross-origin (wildcard ACAO would
    // let any site that discovers the port drain runs/traces/ledger). Non-
    // browser clients send no Origin and are unaffected.
    const origin = req.headers.origin;
    let sameOrigin = false;
    if (origin) {
      try { sameOrigin = new URL(origin).host === host; }
      catch { sameOrigin = false; }
    }
    if (sameOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (!origin) { res.writeHead(204); return res.end(); }
      if (!sameOrigin) { res.writeHead(403); return res.end(JSON.stringify({ error: "cors_denied" })); }
      res.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(protectedResourceDoc(host)));
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = readFileSync(join(root, "console", "console.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    // Share routes sit before the bearer gate on purpose: a share token is its
    // own bearer capability, scoped to exactly one run. Stream first (more
    // specific), then the page. Unknown/revoked tokens 404 with no run details.
    const shareStreamMatch = req.method === "GET" && /^\/share\/([^/]+)\/stream$/.exec(url.pathname);
    if (shareStreamMatch) {
      const share = resolveShareToken(shareStreamMatch[1]);
      if (!share) {
        res.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        return res.end(JSON.stringify({ error: "share_not_found" }));
      }
      return serveRunStream(req, res, url, share.run_id);
    }
    const sharePageMatch = req.method === "GET" && /^\/share\/([^/]+)\/?$/.exec(url.pathname);
    if (sharePageMatch) return serveSharePage(res, sharePageMatch[1]);
    // Single auth gate: everything past the public metadata + static shell +
    // share routes requires bearer when enforced. APE_CONSOLE_TOKEN (when set)
    // gates every /api/* route; share routes stay open by design.
    if (!checkConsoleBearer(req).ok) return consoleUnauthorized(res);
    if (req.method === "GET" && url.pathname === "/api/tools") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(toolsList()));
    }
    if (req.method === "GET" && url.pathname === "/api/discover") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(discover()));
    }
    if (req.method === "GET" && url.pathname === "/api/trace") {
      const since = Number(url.searchParams.get("since") || 0);
      let lines = [];
      try {
        const p = join(process.env.APE_DATA_DIR || join(process.cwd(), ".ape"), "trace.ndjson");
        if (existsSync(p)) {
          const all = r(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
          lines = all.slice(since);
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ events: lines, count: all.length }));
        }
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ events: [], count: 0 }));
    }
    if (req.method === "GET" && url.pathname === "/api/ledger") {
      let entries = [];
      try {
        const p = join(process.env.APE_DATA_DIR || join(process.cwd(), ".ape"), "ledger.jsonl");
        if (existsSync(p)) {
          entries = r(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).slice(-100);
        }
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ entries, count: entries.length }));
    }
    if (req.method === "GET" && url.pathname === "/api/tasks") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ tasks: taskList() }));
    }
    if (req.method === "GET" && url.pathname === "/api/mods") {
      const mods = await loadMods(root);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ mods: mods.map((m) => ({ name: m.name, version: m.version ?? "0.0.0", preCall: typeof m.hooks?.preCall === "function", postCall: typeof m.hooks?.postCall === "function" })) }));
    }
    if (req.method === "GET" && url.pathname === "/api/graph") {
      const g = await dispatch.orchestrate({ op: "graph" });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ graph: g }));
    }
    if (req.method === "GET" && url.pathname === "/api/experience") {
      let runs = [];
      try {
        const p = join(dataDir(), "trace.ndjson");
        if (existsSync(p)) {
          runs = r(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
            .filter((e) => e && (e.tool === "ape_validate_experience" || e.tool === "ape_mcp_eval"))
            .slice(-5).map((e) => ({ ts: e.ts, tool: e.tool, durationMs: e.durationMs, resultSummary: (e.resultSummary || "").slice(0, 300) }));
        }
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ runs }));
    }
    if (req.method === "GET" && url.pathname === "/api/tasks/get") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ task: taskGet(url.searchParams.get("task_id")) }));
    }
    if (req.method === "GET" && url.pathname === "/api/runs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ runs: listRuns(50) }));
    }
    if (req.method === "GET" && url.pathname === "/api/runs/get") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ run: getRun(url.searchParams.get("run_id")) }));
    }
    if (req.method === "GET" && url.pathname === "/api/runs/stream") {
      // Server-sent events: push run/step/spend changes instead of polling.
      // ?run_id=<id> filters the stream to one run (used by the share view's
      // live updates through its token-scoped /share/<token>/stream route).
      const onlyRun = url.searchParams.get("run_id") || null;
      return serveRunStream(req, res, url, onlyRun);
    }
    if (req.method === "GET" && url.pathname === "/api/spend") {
      const dailyCap = Number(process.env.APE_MAX_DAILY_USD ?? 25);
      const maxConcurrent = Number(process.env.APE_MAX_CONCURRENT_RUNS ?? 4);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        today_usd: spendSince(Date.now() - 86400000),
        daily_cap_usd: dailyCap,
        running: runningCount(),
        max_concurrent: maxConcurrent,
      }));
    }
    if (req.method === "GET" && url.pathname === "/api/connectors") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ connectors: connectorList().map((c) => ({ name: c.name, source: c.source, egress_allow: c.egress_allow, operations: c.operations.map((o) => ({ name: o.name, method: o.method, path: o.path, annotations: o.annotations })) })) }));
    }
    if (req.method === "GET" && url.pathname === "/api/profiles") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ profiles: listProfiles().map((n) => describeProfile(n)) }));
    }
    if (req.method === "GET" && url.pathname === "/api/profile") {
      const name = String(url.searchParams.get("name") ?? "");
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "bad profile name" }));
      }
      const userPath = join(dataDir(), "profiles", `${name}.yaml`);
      const bundlePath = join(root, "profiles", `${name}.yaml`);
      const p = existsSync(userPath) ? userPath : bundlePath;
      if (!existsSync(p)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "profile_not_found", name }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ name, source: p, yaml: r(p, "utf8") }));
    }
    if (req.method === "GET" && url.pathname === "/api/templates") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ profile: PROFILE_TEMPLATE, connector: CONNECTOR_TEMPLATE }));
    }
    if (req.method === "POST" && (url.pathname === "/api/profile/save" || url.pathname === "/api/connector/save")) {
      if (!checkConsoleBearer(req).ok) return consoleUnauthorized(res);
      let body = "";
      for await (const c of req) body += c;
      try {
        const { name, yaml } = JSON.parse(body || "{}");
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(name ?? "")) || typeof yaml !== "string" || !yaml.trim()) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "name and non-empty yaml required" }));
        }
        const parsed = YAML.parse(yaml);
        const isProfile = url.pathname === "/api/profile/save";
        if (isProfile) {
          if (!parsed?.name || !parsed?.model) throw new Error("profile needs name + model");
          const dir = join(dataDir(), "profiles");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${name}.yaml`), yaml);
          const loaded = loadProfile(name);
          if (!loaded) throw new Error("saved YAML did not load as a profile");
        } else {
          if (!parsed?.name || !Array.isArray(parsed?.operations)) throw new Error("connector needs name + operations[]");
          const dir = join(dataDir(), "connectors");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${name}.yaml`), yaml);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true, name, kind: isProfile ? "profile" : "connector" }));
      } catch (e) { res.writeHead(400); return res.end(JSON.stringify({ error: String(e?.message ?? e).slice(0, 300) })); }
    }
    if (req.method === "POST" && url.pathname === "/api/call") {
      if (!checkConsoleBearer(req).ok) return consoleUnauthorized(res);
      let body = "";
      for await (const c of req) body += c;
      try {
        const { name, arguments: a } = JSON.parse(body || "{}");
        const out = await dispatchCall(name, a ?? {});
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(out));
      } catch (e) { res.writeHead(400); return res.end(JSON.stringify({ error: String(e).slice(0, 200) })); }
    }
    res.writeHead(404); res.end("{}");
  });
  return new Promise((resolve) => {
    // APE_CONSOLE_HOST (default 127.0.0.1) picks the bind address; 0.0.0.0 is
    // the explicit remote-viewing switch. APE_CONSOLE_PORT pins the port
    // (default: ephemeral). The bound port is recorded in <dataDir>/console.port
    // so ape_agent_share can mint absolute share URLs from any process.
    const bindHost = host || process.env.APE_CONSOLE_HOST || "127.0.0.1";
    const bindPort = port || Number(process.env.APE_CONSOLE_PORT || 0) || 0;
    server.listen(bindPort, bindHost, () => {
      const a = server.address();
      const actualPort = typeof a === "object" && a ? a.port : bindPort;
      try { writeFileSync(consolePortFile(), String(actualPort)); } catch { /* best effort */ }
      if (!isLoopbackHost(bindHost) && !process.env.APE_CONSOLE_TOKEN && process.env.APE_REQUIRE_AUTH !== "1") {
        console.error(`WARNING: APE console on ${bindHost}:${actualPort} has no bearer configured — /api/* is readable by anyone who reaches this port. Set APE_CONSOLE_TOKEN to protect it.`);
      }
      resolve({ server, port: actualPort, host: bindHost });
    });
  });
}
