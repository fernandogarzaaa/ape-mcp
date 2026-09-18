import { createServer } from "node:http";
import { readFileSync, existsSync, readFileSync as r } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchCall, toolsList, discover } from "./server.js";
import { dispatch } from "./dispatch.js";
import { taskList, taskGet } from "./tasks.js";
import { loadMods } from "./mods.js";
import { dataDir } from "./trace.js";
import { protectedResourceDoc, checkBearer, unauthorized } from "./auth.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
