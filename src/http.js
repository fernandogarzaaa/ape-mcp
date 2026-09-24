// APE HTTP server — extracted from bin/ape-mcp.js so tests can boot it on
// ephemeral ports. Route behavior is preserved verbatim; bin keeps CLI parsing
// and calls startHttp({ port, host }).
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { dispatchCall, toolsList, discover, agentMethod, resourcesList, readResource, promptsList, getPrompt, PROTOCOL } from "./server.js";
import { agentCard, handleA2A } from "./agent/a2a.js";
import { taskGet } from "./tasks.js";
import { protectedResourceDoc, checkBearer, unauthorized } from "./auth.js";

// --- Fail-closed bind policy (Phase 11) ---
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"]);
export function resolveBindConfig({ host = "127.0.0.1" } = {}) {
  const h = String(host || "127.0.0.1");
  if (LOOPBACK_HOSTS.has(h.toLowerCase())) return { ok: true, host: h };
  const authed = process.env.APE_REQUIRE_AUTH === "1" &&
    String(process.env.APE_TOKENS || "").split(",").some((s) => s.trim());
  if (authed) return { ok: true, host: h };
  if (process.env.APE_ALLOW_OPEN_REMOTE === "1") {
    return { ok: true, host: h, warning: "UNSAFE: serving APE remotely with no bearer auth (APE_ALLOW_OPEN_REMOTE=1). Anyone who reaches this port can run tools. Not for production." };
  }
  return { ok: false, host: h, error: "refusing remote bind without bearer auth", hint: "set APE_REQUIRE_AUTH=1 and APE_TOKENS=<token>, or APE_ALLOW_OPEN_REMOTE=1 to override (unsafe)" };
}

// --- Exact-origin CORS (Phase 12): allowlist only, never wildcard, none by default ---
export function corsAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  const allowed = String(process.env.APE_CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}
function applyCors(req, res) {
  const origin = corsAllowedOrigin(req);
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  return origin;
}

// --- MCP sessions (Phases 3/4): in-memory, single-node, 30-min idle expiry ---
export const MCP_SESSION_TTL_MS = 30 * 60 * 1000;
export const MCP_SESSION_HEADER = "mcp-session-id";
export const MCP_SESSION_NOT_FOUND = -32001;
const mcpSessions = new Map(); // id -> { createdAt, lastSeen }
export function sweepSessions(nowMs = Date.now()) {
  let swept = 0;
  for (const [id, s] of mcpSessions) {
    if (nowMs - s.lastSeen > MCP_SESSION_TTL_MS) { mcpSessions.delete(id); swept++; }
  }
  return swept;
}
export function mcpSessionCount() { return mcpSessions.size; }
function takeSession(req) {
  sweepSessions();
  const id = req.headers[MCP_SESSION_HEADER];
  if (!id || typeof id !== "string") return null;
  const s = mcpSessions.get(id);
  if (!s) return null;
  s.lastSeen = Date.now();
  return { id, ...s };
}
function newSession() {
  const id = randomUUID();
  const now = Date.now();
  mcpSessions.set(id, { createdAt: now, lastSeen: now });
  return id;
}

// --- MCP JSON-RPC dispatcher (Phases 2/5/8/9) ---
function mcpError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message: String(message).slice(0, 500) } };
}
function mcpOk(id, result) {
  return { jsonrpc: "2.0", id, result };
}

async function handleMcpMessage(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return { response: mcpError(msg?.id, -32600, "invalid request") };
  }
  const { id, method, params } = msg;
  const isNotif = msg.id === undefined;
  if (typeof method !== "string") {
    return { response: mcpError(id, -32600, "invalid request: missing method") };
  }
  try {
    switch (method) {
      case "initialize": {
        // Pinned version (same policy as stdio): never echo the client.
        const result = {
          protocolVersion: PROTOCOL,
          capabilities: discover().capabilities,
          serverInfo: { name: "ape-mcp", version: "1.0.0" },
        };
        if (isNotif) return { notification: true };
        return { response: mcpOk(id, result), newSession: true };
      }
      case "ping": {
        if (isNotif) return { notification: true };
        return { response: mcpOk(id, {}) };
      }
      case "tools/list": {
        if (isNotif) return { notification: true };
        const tools = toolsList().tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          ...(t.annotations ? { annotations: t.annotations } : {}),
        }));
        return { response: mcpOk(id, { tools }) };
      }
      case "tools/call": {
        if (isNotif) return { notification: true };
        const out = await dispatchCall(params?.name, params?.arguments ?? {});
        if (out?.resultType === "input_required") {
          const reqs = out.inputRequests ?? [];
          return {
            response: mcpOk(id, {
              content: [{ type: "text", text: "input_required: " + reqs.map((r) => r.message ?? r.id).join("; ") }],
              structuredContent: { inputRequests: reqs },
              isError: true,
            }),
          };
        }
        const sc = out?.structuredContent;
        const toolError = sc ? sc.ok === false : false;
        const content = Array.isArray(out?.content) && out.content.length
          ? out.content
          : [{ type: "text", text: JSON.stringify(sc?.result ?? out ?? null).slice(0, 8000) }];
        const result = { content };
        if (sc?.result !== undefined) result.structuredContent = sc.result;
        if (toolError) result.isError = true;
        return { response: mcpOk(id, result) };
      }
      case "resources/list": {
        if (isNotif) return { notification: true };
        return { response: mcpOk(id, resourcesList()) };
      }
      case "resources/read": {
        if (isNotif) return { notification: true };
        try {
          return { response: mcpOk(id, await readResource(params?.uri)) };
        } catch (e) {
          return { response: mcpError(id, -32002, `resource error: ${e?.message ?? e}`) };
        }
      }
      case "prompts/list": {
        if (isNotif) return { notification: true };
        return { response: mcpOk(id, promptsList()) };
      }
      case "prompts/get": {
        if (isNotif) return { notification: true };
        return { response: mcpOk(id, await getPrompt(params?.name, params?.arguments ?? {})) };
      }
      default: {
        if (isNotif) return { notification: true };
        return { response: mcpError(id, -32601, `unknown_method: ${method}`) };
      }
    }
  } catch (e) {
    if (isNotif) return { notification: true };
    return { response: mcpError(id, -32603, String(e?.message ?? e)) };
  }
}

const MCP_BODY_CAP = 4 * 1024 * 1024;
function readMcpBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MCP_BODY_CAP) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      body += c;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleMcpPost(req, res) {
  let body = "";
  try {
    body = await readMcpBody(req);
  } catch (e) {
    res.writeHead(e?.status === 413 ? 413 : 400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "body too large" }));
  }
  let payload;
  try {
    payload = JSON.parse(body || "null");
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mcpError(null, -32700, "parse error")));
  }
  const batch = Array.isArray(payload) ? payload : [payload];
  const responses = [];
  let newSessionId = null;
  for (const msg of batch) {
    const needsSession = !(msg && typeof msg === "object" && !Array.isArray(msg) && msg.method === "initialize");
    if (needsSession) {
      const session = takeSession(req);
      if (!session) {
        responses.push(mcpError(msg?.id, MCP_SESSION_NOT_FOUND, "session-not-found: initialize first and send mcp-session-id"));
        continue;
      }
    }
    const handled = await handleMcpMessage(msg);
    if (handled.newSession) {
      newSessionId = newSession();
    }
    if (handled.response) responses.push(handled.response);
  }
  if (newSessionId) res.setHeader(MCP_SESSION_HEADER, newSessionId);
  if (!responses.length) {
    res.writeHead(202);
    return res.end();
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  return res.end(JSON.stringify(Array.isArray(payload) ? responses : responses[0]));
}

export function startHttp({ port = 8787, host = "127.0.0.1" } = {}) {
  const server = createServer(async (req, res) => {
    const h = req.headers.host || `${host}:${port}`;
    if (req.method === "GET" && req.url === "/.well-known/oauth-protected-resource") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(protectedResourceDoc(h)));
    }
    if (req.method === "GET" && req.url === "/.well-known/agent.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(agentCard(`http://${h}`)));
    }
    if (req.method === "POST" && req.url === "/a2a") {
      if (!checkBearer(req).ok) return unauthorized(res, h);
      let body = "";
      for await (const c of req) body += c;
      try {
        const { id, method, params } = JSON.parse(body || "{}");
        try {
          const result = await handleA2A(method, params ?? {});
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
        } catch (e) {
          const code = typeof e?.code === "number" ? e.code : -32603;
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message: String(e?.message ?? e).slice(0, 300) } }));
        }
      } catch (e) { res.writeHead(400); return res.end(JSON.stringify({ error: String(e).slice(0, 200) })); }
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
      if (!checkBearer(req).ok) return unauthorized(res, h);
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
    // MCP Streamable HTTP endpoint (v1): hand-rolled JSON-RPC dispatcher reusing
    // the stdio method set. Single-node in-memory sessions; no server-initiated
    // streams (GET -> 405). See docs/remote.md for the wire contract.
    const pathname = req.url.split("?")[0];
    if (pathname === "/mcp") {
      if (req.method === "OPTIONS") {
        // Preflight never carries auth: answer from CORS policy alone.
        if (!req.headers.origin) { res.writeHead(204); return res.end(); }
        if (!applyCors(req, res)) { res.writeHead(403, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "cors_denied" })); }
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, mcp-session-id",
        });
        return res.end();
      }
      applyCors(req, res);
      if (!checkBearer(req).ok) return unauthorized(res, h);
      if (req.method === "GET") {
        res.writeHead(405, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "method_not_allowed", detail: "server-initiated streams unsupported in v1; use POST /mcp" }));
      }
      if (req.method === "DELETE") {
        sweepSessions();
        const id = req.headers[MCP_SESSION_HEADER];
        if (!id || typeof id !== "string" || !mcpSessions.has(id)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(mcpError(null, MCP_SESSION_NOT_FOUND, "session-not-found: unknown or expired session")));
        }
        mcpSessions.delete(id);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.method === "POST") {
        return handleMcpPost(req, res);
      }
      res.writeHead(405, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "method_not_allowed" }));
    }
    res.writeHead(404); res.end("{}");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === "object" ? addr.port : port, host });
    });
  });
}
