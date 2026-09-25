/**
 * Secret redaction for evidence artifacts.
 *
 * Genesis stores raw collector output — test logs, CI logs, scanner reports —
 * as evidence blobs, and those routinely contain tokens. Redaction must happen
 * *before* the blob is written and *before* its digest is computed, or the
 * digest certifies an artifact that no longer matches what is stored.
 *
 * Extends v1's registered-value redaction (`kernel/security/secret-store.ts`)
 * with pattern matching, because Genesis reads logs from repositories whose
 * secrets it was never told about.
 */
export declare const REDACTED = "[REDACTED]";
/** Register a known secret value for exact-match redaction. */
export declare function registerSecret(value: string): void;
export declare function clearRegisteredSecrets(): void;
/** Redact registered secrets and recognizable credential patterns. */
export declare function redact(text: string): string;
/** Redact every string in a JSON-ish structure, in place of the original. */
export declare function redactDeep<T>(value: T): T;
/** True when a field name carries credentials regardless of value shape. */
export declare function isSensitiveKey(key: string): boolean;
//# sourceMappingURL=redact.d.ts.map