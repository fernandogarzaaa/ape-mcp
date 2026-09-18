#!/usr/bin/env node
// ape-mcp: stdio JSON-RPC 2.0 (MCP 2026-07-28 compatible surface) + --http Streamable-ish
// endpoint, plus the operator CLI (serve/run/doctor/mods/trace) under one bin entry.
// Stateless protocol: state travels in handles (organism_id, node, task_id, run_id).
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchCall, toolsList, discover, agentMethod } from "../src/server.js";
import { taskGet } from "../src/tasks.js";
import { protectedResourceDoc, checkBearer, unauthorized } from "../src/auth.js";
import { startConsole } from "../src/console.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const [cmd, ...rest] = args;

function openBrowser(url) {
  const p = process.platform;
  try {
    if (p === "win32") execSync(`start "" "${url}"`, { shell: true });
    else if (p === "darwin") execSync(`open "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch { console.log("Open manually: " + url); }
}

if (args.includes("--http")) {
  const port = Number(process.env.APE_PORT || args[args.indexOf("--http") + 1] || 8787);
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
    if (req.method === "POST" && (req.url === "/call" || req.url === "/tasks/get" || req.url === "/agent")) {
      if (!checkBearer(req).ok) return unauthorized(res, host);
      let body = "";
      for await (const c of req) body += c;
      try {
        if (req.url === "/agent") {
          const { method, params } = JSON.parse(body || "{}");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ resultType: "complete", result: await agentMethod(method, params ?? {}) }));
        }
        if (req.url === "/tasks/get") {
          const { task_id } = JSON.parse(body || "{}");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ resultType: "complete", task: taskGet(task_id) }));
        }
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
  server.listen(port, "127.0.0.1", () => console.log(`ape-mcp http on http://127.0.0.1:${port}`));
} else if (cmd === "console" || (!cmd && process.stdin.isTTY)) {
  const { port } = await startConsole({ port: 0 });
  const url = `http://127.0.0.1:${port}/`;
  console.log(`APE console: ${url}`);
  console.log(`MCP: stdio via 'ape-mcp' | http via 'ape-mcp --http 8787'`);
  openBrowser(url);
  setInterval(() => {}, 1 << 30);
} else if (cmd === "serve") {
  const noOpen = rest.includes("--no-open");
  const { port } = await startConsole({ port: 0 });
  const url = `http://127.0.0.1:${port}/`;
  console.log(url);
  if (!noOpen) openBrowser(url);
  setInterval(() => {}, 1 << 30);
} else if (cmd === "run") {
  const tool = rest[0] ?? "ape_status";
  let a = {};
  const toks = rest.slice(1);
  if (toks.length === 1 && toks[0].trim().startsWith("{")) {
    try { a = JSON.parse(toks[0]); } catch { a = {}; }
  } else if (toks.length) {
    let cur = null;
    for (const t of toks) {
      if (t === "--yes") continue;
      const eq = t.indexOf("=");
      if (eq > 0 && /^[A-Za-z_]\w*$/.test(t.slice(0, eq))) {
        cur = t.slice(0, eq);
        a[cur] = t.slice(eq + 1);
      } else if (cur) {
        a[cur] += " " + t;
      }
    }
    for (const k of Object.keys(a)) {
      const v = a[k];
      if (/^-?\d+$/.test(v)) a[k] = Number(v);
      else if (v === "true") a[k] = true;
      else if (v === "false") a[k] = false;
    }
  }
  const out = await dispatchCall(tool, a, { headlessBypass: rest.includes("--yes") });
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === "doctor") {
  const { egressHosts } = await import("../src/agent/providers.js");
  const { connectorHosts } = await import("../src/connectors.js");
  const checks = [
    ["node>=22.5", Number(process.versions.node.split(".")[0]) >= 22 && Number(process.versions.node.split(".")[1]) >= 5],
    ["node:sqlite", (await import("../src/sqlite.js")).DatabaseSync ? true : false],
    ["vendors/genesis", existsSync(join(root, "vendors/genesis/src/cli"))],
    ["vendors/eve", existsSync(join(root, "vendors/eve/src/cli"))],
    ["vendors/adam", existsSync(join(root, "vendors/adam/crates"))],
    ["vendors/skein", existsSync(join(root, "vendors/skein/src/skein/cli.py"))],
    ["console.html", existsSync(join(root, "console/console.html"))],
  ];
  let fail = 0;
  for (const [n, ok] of checks) { console.log((ok ? "ok  " : "FAIL") + "  " + n); if (!ok) fail++; }
  console.log("egress hosts (providers + connectors):");
  for (const h of [...egressHosts(), ...connectorHosts()].sort()) console.log("     " + h);
  process.exit(fail ? 1 : 0);
} else if (cmd === "mods") {
  console.log("mods: mods/policy-gates (enabled) — see ape.config.yaml; toggle via mods/<name>/mod.json {enabled}");
} else if (cmd === "trace") {
  const out = await dispatchCall("ape_status", {});
  console.log(JSON.stringify(out.structuredContent.result.engines, null, 2));
  console.log("trace: .ape/trace.ndjson (GET /api/trace?since=N in console)");
} else {
    // stdio: newline-delimited JSON-RPC {id, method, params}
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("end", () => process.exit(0));
    process.stdin.on("data", async (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const { id, method, params } = msg;
        if (id === undefined) continue; // notification — no response
        let result;
        if (method === "initialize") {
          const requested = typeof params?.protocolVersion === "string" ? params.protocolVersion : null;
          // Negotiate: accept any protocol version the client speaks (methods are
          // compatible), fall back to our pin when unspecified.
          result = { protocolVersion: requested ?? "2026-07-28", capabilities: discover().capabilities, serverInfo: { name: "ape-mcp", version: "1.0.0" } };
        } else if (method === "ping") {
          result = {};
        } else if (method === "server/discover") result = discover();
        else if (method === "tools/list") result = toolsList();
        else if (method === "tasks/get") result = { resultType: "complete", task: taskGet(params?.task_id) };
        else if (method === "tools/call") result = await dispatchCall(params?.name, params?.arguments ?? {});
        else if (method.startsWith("agent/")) result = await agentMethod(method, params ?? {});
        else result = { error: "unknown_method", method };
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
      } catch (e) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(e).slice(0, 200) } }) + "\n");
      }
    }
  });
}