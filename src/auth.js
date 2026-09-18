// Auth seam (OAuth 2.1 resource-server shape, local-only v1).
// Default: open (localhost console). Opt-in: APE_REQUIRE_AUTH=1 + APE_TOKENS=csv.
// When enforced and no external IdP is configured, 401 points at the RFC9728
// well-known document; a future IdP plugs in via APE_AUTH_SERVERS (JSON array).
export function authServers() {
  try {
    const v = JSON.parse(process.env.APE_AUTH_SERVERS || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export function authRequired() {
  return process.env.APE_REQUIRE_AUTH === "1";
}
export function protectedResourceDoc(host) {
  return {
    resource: `http://${host}/`,
    authorization_servers: authServers(),
    bearer_methods_supported: ["header"],
    ape_mode: authRequired() ? "bearer-enforced" : "local-open",
  };
}
export function checkBearer(req) {
  if (!authRequired()) return { ok: true };
  const hdr = String(req.headers["authorization"] || "");
  const tok = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  const allowed = String(process.env.APE_TOKENS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (tok && allowed.includes(tok)) return { ok: true };
  return { ok: false };
}
export function unauthorized(res, host) {
  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": `Bearer resource_metadata="http://${host}/.well-known/oauth-protected-resource"`,
  });
  res.end(JSON.stringify({ error: "unauthorized", detail: "Set Authorization: Bearer <token from APE_TOKENS>" }));
}
