// Connectors — declarative user-defined HTTP bindings. The ONLY runtime network
// path besides model providers. Rules:
//   - Declarative only: no user-supplied JS (that is what mods are for).
//   - Every connector declares egress_allow; requests outside it are refused.
//   - Auth is by environment-variable reference, never inline values.
//   - Destructive ops inherit the MRTR confirm gate before an agent may call them.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function bundledDir() { return join(root, "connectors"); }
function userDir() {
  const d = process.env.APE_DATA_DIR || join(process.cwd(), ".ape");
  return join(d, "connectors");
}

export function connectorList() {
  const out = [];
  for (const dir of [userDir(), bundledDir()]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".yaml")) continue;
      const p = join(dir, f);
      try {
        const c = YAML.parse(readFileSync(p, "utf8"));
        if (c?.name && Array.isArray(c.operations)) {
          if (!out.find((x) => x.name === c.name)) {
            out.push({ ...c, source: p, egress_allow: c.egress_allow ?? [] });
          }
        }
      } catch { /* skip broken connector file */ }
    }
  }
  return out;
}

export function loadConnector(name) {
  return connectorList().find((c) => c.name === name) ?? null;
}

export function connectorHosts() {
  const hosts = new Set();
  for (const c of connectorList()) for (const h of c.egress_allow) hosts.add(h);
  return [...hosts];
}

function resolveAuth(conn) {
  if (!conn.auth) return {};
  const { type, token_env, header_name } = conn.auth;
  const token = token_env ? process.env[token_env] : null;
  if (token_env && !token) return { error: `connector_auth_missing: set ${token_env}` };
  if (type === "bearer") return { headers: { authorization: `Bearer ${token}` } };
  if (type === "header") return { headers: { [header_name ?? "x-api-key"]: token } };
  if (type === "query") return { query: { [header_name ?? "key"]: token } };
  return {};
}

function hostAllowed(conn, url) {
  try {
    const h = new URL(url).hostname;
    return conn.egress_allow.some((a) => a === h || h.endsWith("." + a));
  } catch { return false; }
}

function renderQuery(op, input) {
  if (!op.query) return null;
  const params = new URLSearchParams();
  for (const [key, spec] of Object.entries(op.query)) {
    let val = spec?.const;
    if (val === undefined) val = spec?.default;
    if (val === undefined && spec?.from) val = input?.[spec.from];
    if (val !== undefined && val !== null) params.set(key, String(val));
  }
  const s = params.toString();
  return s ? "?" + s : "";
}

function renderBody(op, input) {
  if (!op.body) return null;
  const body = {};
  for (const [key, spec] of Object.entries(op.body)) {
    let val = spec?.const;
    if (val === undefined) val = spec?.default;
    if (val === undefined && spec?.from) val = input?.[spec.from];
    if (val !== undefined) body[key] = val;
  }
  return body;
}

export async function runConnectorOperation(conn, op, input = {}, ctx = {}) {
  if (op.annotations?.destructive && ctx.confirm !== true && !ctx.headlessBypass) {
    return { error: "input_required", message: "destructive connector operation needs explicit confirm", operation: op.name };
  }
  let path = op.path;
  for (const [k, v] of Object.entries(input ?? {})) {
    if (typeof v === "string") path = path.replaceAll(`{${k}}`, encodeURIComponent(v));
  }
  let url = conn.base_url.replace(/\/$/, "") + path + (renderQuery(op, input) ?? "");
  if (!hostAllowed(conn, url)) {
    let host = "?";
    try { host = new URL(url).hostname; } catch { /* ignore */ }
    return { error: "egress_denied", host, egress_allow: conn.egress_allow, url };
  }
  const auth = resolveAuth(conn);
  if (auth.error) return { error: auth.error, connector: conn.name };
  // Query auth is part of the request, never of the record: secret param names
  // are redacted in every returned URL (results, traces, errors).
  const secretParams = new Set(Object.keys(auth.query ?? {}));
  if (auth.query) {
    try {
      const u = new URL(url);
      for (const [k, v] of Object.entries(auth.query)) u.searchParams.set(k, v);
      url = u.toString();
    } catch { return { error: "connector_bad_url", connector: conn.name }; }
  }
  const redactUrl = (u) => {
    if (!secretParams.size) return u;
    try {
      const r = new URL(u);
      for (const k of secretParams) if (r.searchParams.has(k)) r.searchParams.set(k, "***");
      return r.toString();
    } catch { return u; }
  };
  const body = renderBody(op, input);
  // Hard timeout: engine calls have a 120s cap; connectors must not stall a step
  // indefinitely and defeat max_wall_seconds. Per-operation `timeout_ms`, else 30s.
  const timeoutMs = Number(op.timeout_ms ?? conn.timeout_ms ?? 30000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const init = {
    method: op.method,
    headers: { accept: "application/json", ...(auth.headers ?? {}) },
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
    signal: ctrl.signal,
  };
  try {
    // Egress containment must hold for EVERY actual destination, not just the
    // constructed URL: fetch() follows redirects by default, so a 302 from an
    // allowed host could otherwise escape the allowlist. Manual redirect chain
    // with per-hop host validation (max 5 hops).
    //
    // Credential scope (CR-2): auth headers and query secrets belong to ONE
    // origin. Same-origin hops (and same-host http→https upgrades) forward
    // them; any other hop is REJECTED by default (cross_origin_redirect)
    // unless the connector opts in with allow_cross_origin_redirects: true —
    // and even then the hop goes out CLEAN (no auth headers, secret params
    // stripped). An allowed redirect target can never receive another
    // origin's credential.
    const originOf = (u) => {
      const x = new URL(u);
      return `${x.protocol}//${x.hostname}${x.port ? ":" + x.port : ""}`;
    };
    const isHttpsUpgrade = (from, to) => {
      const a = new URL(from);
      const b = new URL(to);
      return a.hostname === b.hostname && a.protocol === "http:" && b.protocol === "https:";
    };
    const cleanInit = { ...init, headers: { accept: "application/json" } };
    const stripSecrets = (u) => {
      if (!secretParams.size) return u;
      try {
        const x = new URL(u);
        for (const k of secretParams) x.searchParams.delete(k);
        return x.toString();
      } catch { return u; }
    };
    const maxHops = 5;
    let hopUrl = url;
    let hopInit = init;
    let finalUrl = url;
    let res = null;
    for (let hop = 0; hop <= maxHops; hop++) {
      const r = await fetch(hopUrl, { ...hopInit, redirect: "manual" });
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        let next = null;
        try { next = new URL(loc, hopUrl).toString(); } catch { /* bad Location */ }
        try { await r.arrayBuffer(); } catch { /* drain best-effort */ }
        if (!next) { clearTimeout(timer); return { ok: false, error: "connector_bad_redirect", url: redactUrl(hopUrl) }; }
        if (!hostAllowed(conn, next)) {
          clearTimeout(timer);
          let host = "?";
          try { host = new URL(next).hostname; } catch { /* ignore */ }
          return { error: "egress_denied_redirect", host, egress_allow: conn.egress_allow, url: redactUrl(hopUrl), redirect: redactUrl(next) };
        }
        let same = false;
        let upgrade = false;
        try {
          same = originOf(next) === originOf(hopUrl);
          upgrade = !same && isHttpsUpgrade(hopUrl, next);
        } catch { /* unparsable — treated as cross-origin below */ }
        if (!same && !upgrade && conn.allow_cross_origin_redirects !== true) {
          clearTimeout(timer);
          return { error: "cross_origin_redirect", from: redactUrl(hopUrl), redirect: redactUrl(next), hint: "redirect target is a different origin; set allow_cross_origin_redirects: true to permit (auth never forwards cross-origin)" };
        }
        if (hop === maxHops) { clearTimeout(timer); return { ok: false, error: "too_many_redirects", url: redactUrl(hopUrl) }; }
        hopUrl = next;
        finalUrl = next;
        // Same origin (or safe upgrade): credentials ride along. Anything
        // else: clean hop even when explicitly permitted.
        hopInit = (same || upgrade) ? init : cleanInit;
        if (!same && !upgrade) hopUrl = stripSecrets(next);
        continue;
      }
      res = r;
      finalUrl = hopUrl;
      break;
    }
    if (!res) { clearTimeout(timer); return { ok: false, error: "too_many_redirects", url: redactUrl(url) }; }
    clearTimeout(timer);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-json body */ }
    return { ok: res.ok, status: res.status, operation: op.name, url: redactUrl(finalUrl), body: json ?? text.slice(0, 4000) };
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e?.name === "AbortError";
    return { ok: false, error: timedOut ? "connector_timeout" : "connector_fetch_failed", message: String(e?.message ?? e).slice(0, 200), url: redactUrl(url), timeout_ms: timedOut ? timeoutMs : undefined };
  }
}