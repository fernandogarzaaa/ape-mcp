import type { CanonicalSurfaceIdentity } from "../memory/surfaceIdentity.js";
import type { HumanStep } from "./alignment.js";
import type { HumanStudy, HumanTrace } from "./types.js";
export declare const REDACTED_EMAIL = "[redacted:email]";
export declare const REDACTED_SECRET = "[redacted:secret]";
/** Redact emails, bearer tokens, api keys, and token-like blobs in text. */
export declare function redactTextSecrets(text: string): string;
/**
 * True when a field name suggests secret content (form field names,
 * JSON keys, self-report labels). Conservative by design: over-redaction
 * is auditable, under-redaction is a breach.
 */
export declare function isSecretFieldName(name: string): boolean;
/**
 * Normalize a traced URL for dataset storage: origin + scrubbed path plus
 * ONLY state-bearing query values (via the same semantic classification
 * EVE uses internally). Path segments are scrubbed for emails/secrets —
 * human paths routinely embed identifiers (`/users/jane@x.com`). High-
 * cardinality query values — session ids, tracking tokens, search text —
 * never enter the dataset.
 */
export declare function sanitizeTraceUrl(url: string): string;
/** Sanitize one aggregate human trace (paths, abandonment screen). */
export declare function sanitizeHumanTrace(trace: HumanTrace): HumanTrace;
/** Sanitize a full human study. Deterministic and idempotent. */
export declare function sanitizeHumanStudy(study: HumanStudy): HumanStudy;
/** Sanitize a nested canonical state reference (no field escapes scrutiny). */
export declare function sanitizeCanonicalState(state: CanonicalSurfaceIdentity): CanonicalSurfaceIdentity;
/** Sanitize one per-step human record (targets, labels, self-reports). */
export declare function sanitizeHumanStep(step: HumanStep): HumanStep;
//# sourceMappingURL=sanitize.d.ts.map