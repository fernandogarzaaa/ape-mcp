import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export function dataDir() {
  return process.env.APE_DATA_DIR || join(process.cwd(), ".ape");
}
export function tracePath() {
  return join(dataDir(), "trace.ndjson");
}
export function ensureDataDir() {
  mkdirSync(dataDir(), { recursive: true });
}
export function newTraceId() {
  return randomUUID().slice(0, 8);
}
// Key-like strings must never land in traces, displays, or ledgers:
// upstream providers sometimes echo credentials inside error text.
// Focused patterns for high-signal secret classes (vendor key prefixes,
// PEM blocks, bearer/query/assignment forms); unknown shapes pass through
// rather than risk mangling real messages. Redaction is heuristic, not
// universal: it catches known credential SHAPES, not all secrets. Callers
// must still avoid placing raw credentials in tool output, and operators
// must not paste secrets into objectives/args (caller input is stored
// verbatim for replay fidelity; only RESULT-side text is scrubbed).
const SECRET_RES = [
  /sk-(?:ant|proj|test)-?[\w-]{8,}/g,
  /sk-[A-Za-z0-9-_]{12,}/g,
  /xox[bpas]-[A-Za-z0-9-]+/g,
  /gh[pousr]_[A-Za-z0-9]+/g,
  /AIza[0-9A-Za-z\-_]{10,}/g,
  /xai-[A-Za-z0-9-_]{10,}/g,
  /gsk_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /bearer\s+[A-Za-z0-9\-._~+/=]{8,}/gi,
  // PEM private-key block (header through END marker; bounded in practice
  // because summaries are sliced to a few hundred chars before this runs).
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[A-Za-z0-9+/=\s]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  // Query-string / fragment credentials (?key= / &token= / #access_token=).
  /([?&](?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret)=)[^&\s"'{}]+/gi,
];
const ASSIGN_RE = /((["']?)(?:api[_-]?key|refresh[_-]?token|password|passwd|passphrase|token|secret)\2\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^"'\s,}]+)/gi;
export function redactSecrets(text) {
  let out = String(text ?? "");
  for (const re of SECRET_RES) {
    re.lastIndex = 0;
    out = out.replace(re, "[redacted]");
  }
  ASSIGN_RE.lastIndex = 0;
  return out.replace(ASSIGN_RE, (match, prefix) => {
    const quote = match[prefix.length];
    return prefix + (quote === '"' || quote === "'" ? `${quote}[redacted]${quote}` : "[redacted]");
  });
}
export function emitTrace(entry) {
  try {
    ensureDataDir();
    const safe = { ...entry };
    if (typeof safe.resultSummary === "string") safe.resultSummary = redactSecrets(safe.resultSummary);
    appendFileSync(tracePath(), JSON.stringify({ ts: new Date().toISOString(), ...safe }) + "\n");
  } catch { /* trace never breaks calls */ }
}
// Local index keys only (args hashes, trace args): 32-bit, NOT provenance.
// Anything identity-grade (outcome families/hashes, profile/env fingerprints,
// evidence digests) uses SHA-256 from outcomes.js / evidence.js.
export function shaShort(s) {
  let h = 0;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
