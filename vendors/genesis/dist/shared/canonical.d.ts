/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) + SHA-256.
 *
 * Every hash in Genesis — contract hashes, ledger entry hashes — is taken over
 * canonical JSON rather than `JSON.stringify` output. The difference matters:
 * `JSON.stringify` preserves key insertion order, so two structurally identical
 * contracts built by different code paths produce different digests. A frozen
 * contract whose hash depends on how it was constructed is not frozen.
 *
 * This is the property ADAM's `content_hash` documents ("order-independent
 * canonicalized JSON, so two genomes with identical content always hash
 * identically regardless of HashMap iteration order"), ported to TypeScript.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
/** Raised when a value cannot be canonicalized. */
export declare class CanonicalizationError extends Error {
    readonly name = "CanonicalizationError";
}
/**
 * Serialize a value to RFC 8785 canonical JSON.
 *
 * - Object keys are sorted by UTF-16 code unit (JS default string ordering,
 *   which is exactly what the RFC specifies).
 * - No insignificant whitespace.
 * - Numbers use ECMAScript `Number::toString`, which is what `JSON.stringify`
 *   already emits. `NaN` and `±Infinity` are rejected rather than silently
 *   coerced to `null`, because a digest over silently-corrupted input is worse
 *   than a failure.
 * - `undefined` and functions are rejected for the same reason: `JSON.stringify`
 *   drops object properties holding them, which would make two different
 *   inputs hash identically.
 */
export declare function canonicalize(value: unknown): string;
/** SHA-256 of a UTF-8 string, lowercase hex. */
export declare function sha256(input: string | Buffer): string;
/** SHA-256 over the canonical JSON form of a value. */
export declare function hashCanonical(value: unknown): string;
/**
 * Hash a value while excluding named top-level fields.
 *
 * Used for content-addressing records that carry their own digest (a contract's
 * `contract_hash`, a ledger entry's `entry_hash`) — the digest field cannot be
 * part of its own input.
 */
export declare function hashCanonicalExcluding(value: Record<string, unknown>, exclude: readonly string[]): string;
/** The all-zero digest used as the ledger's genesis-block predecessor. */
export declare const ZERO_HASH: string;
//# sourceMappingURL=canonical.d.ts.map