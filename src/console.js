import { createServer } from "node:http";
import { readFileSync, existsSync, readFileSync as r, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { dispatchCall, toolsList, discover } from "./server.js";
import { dispatch } from "./dispatch.js";
import { taskList, taskGet } from "./tasks.js";
import { loadMods } from "./mods.js";
import { dataDir } from "./trace.js";
import { listRuns, getRun, runningCount, spendSince } from "./runs.js";
import { connectorList } from "./connectors.js";
import { listProfiles, describeProfile, loadProfile } from "./agent/profiles.js";
import { protectedResourceDoc, checkBearer, unauthorized } from "./auth.js";

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

export function startConsole({ port = 0, open = false } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const host = req.headers.host || "127.0.0.1";
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(protectedResourceDoc(host)));
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = readFileSync(join(root, "console", "console.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
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
      if (!checkBearer(req).ok) return unauthorized(res, host);
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
      if (!checkBearer(req).ok) return unauthorized(res, host);
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
    server.listen(port, "127.0.0.1", () => {
      const a = server.address();
      resolve({ server, port: typeof a === "object" && a ? a.port : port });
    });
  });
}
