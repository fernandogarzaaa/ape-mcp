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
// Conservative patterns (vendor key prefixes + bearer/token assignments);
// unknown shapes pass through rather than risk mangling real messages.
const SECRET_RES = [
  /sk-(?:ant|proj|test)-?[\w-]{8,}/g,
  /sk-[A-Za-z0-9-_]{12,}/g,
  /xox[bpas]-[A-Za-z0-9-]+/g,
  /gh[pousr]_[A-Za-z0-9]+/g,
  /AIza[0-9A-Za-z\-_]{10,}/g,
  /Bearer\s+[A-Za-z0-9\-._~+/=]+/g,
];
const ASSIGN_RE = /((?:api[_-]?key|token|secret)\s*[:=]\s*["']?)[^"'\s,}]+/gi;
export function redactSecrets(text) {
  let out = String(text ?? "");
  for (const re of SECRET_RES) {
    re.lastIndex = 0;
    out = out.replace(re, "[redacted]");
  }
  ASSIGN_RE.lastIndex = 0;
  return out.replace(ASSIGN_RE, "$1[redacted]");
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
