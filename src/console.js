import { createServer } from "node:http";
import { readFileSync, existsSync, readFileSync as r } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchCall, toolsList, discover } from "./server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function startConsole({ port = 0, open = false } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    res.setHeader("Access-Control-Allow-Origin", "*");
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
        const p = join(process.env.GODMODE_DATA_DIR || join(process.cwd(), ".godmode"), "trace.ndjson");
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
    if (req.method === "POST" && url.pathname === "/api/call") {
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
