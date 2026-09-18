// Recovery — failure fingerprints, bounded retry, and immunity memory.
// When a tool call fails with a transient-looking error, the loop consults past
// repairs (stored in ADAM), retries once, and records the outcome. Best-effort:
// ADAM unavailable means skip, never crash.
import { adamCall } from "../adam-client.js";

// Errors worth retrying once. Permanent conditions (missing builds, unknown tools,
// policy denials, confirm gates) are never retried.
const RETRYABLE = new Set([
  "handler_failed",
  "connector_fetch_failed",
  "connector_timeout",
  "timeout",
]);

export function isRetryable(result) {
  return !!result && typeof result.error === "string" && RETRYABLE.has(result.error);
}

// Coarse fingerprint: tool + error code (not the message, so it matches across
// instances of the same failure class).
export function fingerprint(toolName, result) {
  return `${toolName}:${result?.error ?? "unknown"}`;
}

export async function lookupImmunity(fingerprintStr, organismId = "default") {
  try {
    const r = await adamCall("adam_memory_query", { query: fingerprintStr, top_k: 3 }, organismId);
    if (r._adam !== "ok") return null;
    const texts = (r.result ?? []).map((c) => c?.text ?? "").join("\n");
    return texts.includes(fingerprintStr) ? texts.slice(0, 500) : null;
  } catch { return null; }
}

export async function recordImmunity(fingerprintStr, repair, outcome, organismId = "default") {
  try {
    await adamCall("adam_memory_store", {
      kind: "procedural",
      content: `repair:${fingerprintStr} repair=${repair} outcome=${outcome}`,
      origin: "observation",
      confidence: 0.7,
    }, organismId);
  } catch { /* best-effort */ }
}