#!/usr/bin/env node
// godmode-mcp: stdio JSON-RPC 2.0 (MCP 2026-07-28 compatible surface) + --http Streamable-ish endpoint.
// Stateless protocol: state travels in handles (organism_id, node, task_id).
import { createServer } from "node:http";
import { dispatchCall, toolsList, discover } from "../src/server.js";
import { protectedResourceDoc, checkBearer, unauthorized } from "../src/auth.js";

const args = process.argv.slice(2);
if (args.includes("--http")) {
  const port = Number(process.env.GODMODE_PORT || args[args.indexOf("--http") + 1] || 8787);
  const server = createServer(async (req, res) => {
    const host = req.headers.host || `127.0.0.1:${port}`;
    if (req.method === "GET" && req.url === "/.well-known/oauth-protected-resource") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(protectedResourceDoc(host)));
    }
    if (req.method === "GET" && req.url === "/discover") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(discover()));
    }
    if (req.method === "GET" && req.url === "/tools") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(toolsList()));
    }
    if (req.method === "POST" && req.url === "/call") {
      if (!checkBearer(req).ok) return unauthorized(res, host);
      let body = "";
      for await (const c of req) body += c;
      try {
        const { name, arguments: a } = JSON.parse(body || "{}");
        if ((req.headers["mcp-method"] && req.headers["mcp-method"] !== "tools/call")) {
          res.writeHead(400); return res.end(JSON.stringify({ error: { code: -32020, message: "HeaderMismatch" } }));
        }
        const out = await dispatchCall(name, a ?? {});
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(out));
      } catch (e) { res.writeHead(400); return res.end(JSON.stringify({ error: String(e).slice(0, 200) })); }
    }
    res.writeHead(404); res.end("{}");
  });
  server.listen(port, "127.0.0.1", () => console.log(`godmode-mcp http on http://127.0.0.1:${port}`));
} else {
  // stdio: newline-delimited JSON-RPC {id, method, params}
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const { id, method, params } = msg;
        let result;
        if (method === "server/discover") result = discover();
        else if (method === "tools/list") result = toolsList();
        else if (method === "tools/call") result = await dispatchCall(params?.name, params?.arguments ?? {});
        else result = { error: "unknown_method", method };
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
      } catch (e) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(e).slice(0, 200) } }) + "\n");
      }
    }
  });
}
