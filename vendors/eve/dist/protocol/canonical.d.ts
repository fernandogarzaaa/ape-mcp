/**
 * CP/1 canonical form — the byte-exact encoding every document hashes over.
 *
 * `JSON.stringify` is close but not canonical: it emits members in insertion
 * order, and CP/1 requires them sorted by **UTF-8 bytes** — which is not what
 * `Array.prototype.sort()` gives (see {@link compareUtf8}). This module imposes
 * that ordering, reusing `JSON.stringify` only for scalar rendering, whose
 * escaping rules (escape `"`, `\` and `U+0000`–`U+001F`, using `\b \f \n \r \t`
 * where they exist, leaving non-ASCII literal) already match the specification.
 *
 * Non-integer numbers are rejected rather than rendered. CP/1 puts no floating
 * point on the wire, so encountering one means a caller built a document that
 * will hash differently in the Rust bindings — failing here is far better than
 * emitting bytes the other side will reject.
 *
 * See `protocol/cp1/SPEC.md` section 2.
 */
/** A JSON value CP/1 permits. Note the absence of `null`. */
export type CanonicalValue = string | number | boolean | readonly CanonicalValue[] | {
    readonly [key: string]: CanonicalValue;
};
export declare class CanonicalError extends Error {
    /** Where in the document the problem is, e.g. `$.baseline.composite_bp`. */
    readonly path: string;
    constructor(message: string, 
    /** Where in the document the problem is, e.g. `$.baseline.composite_bp`. */
    path: string);
}
/**
 * Render a value in CP/1 canonical form.
 *
 * @throws {CanonicalError} if the value contains a non-integer number, a
 * `null`, an `undefined`, or a type JSON cannot represent.
 */
export declare function toCanonical(value: unknown): string;
/**
 * Order two strings by their UTF-8 bytes, as CP/1 requires.
 *
 * `Array.prototype.sort()` compares UTF-16 code units, which is **not** the
 * same ordering beyond the BMP: a leading surrogate (`D800`–`DBFF`) sorts below
 * `U+FFFD`, while the corresponding UTF-8 lead byte `F0` sorts above `EF`. A
 * binding using the default comparator therefore produces different canonical
 * bytes — and a different `content_hash` — than the Rust and Python bindings
 * for the same document.
 *
 * The fixture corpus carries a `Genome` whose `preferences` include `U+FFFD`
 * and `U+1D11E` precisely so this cannot regress unnoticed.
 */
export declare function compareUtf8(a: string, b: string): number;
export declare function sha256Hex(input: string): string;
/**
 * SHA-256 over the canonical form of `document` with `provenance.content_hash`
 * removed — a document cannot commit to its own hash.
 *
 * Everything else is inside the hash on purpose, including evidence and
 * `derived_from`: the provenance chain is only unforgeable if substituting the
 * evidence changes the hash (SPEC.md section 4.1).
 */
export declare function contentHash(document: Record<string, unknown>): string;
/**
 * Return a copy of `document` with `provenance.content_hash` set to its true
 * value. Sealing is idempotent: a previously recorded hash is stripped before
 * the new one is computed.
 *
 * @throws {CanonicalError} when the document carries no `provenance` object.
 * Returning an unsealed copy would let {@link sealEnvelope} wrap, hash, sign and
 * transmit it, and the *receiver* would reject it with `seal-broken` — surfacing
 * the fault on the wrong side of the boundary, when the producer had everything
 * needed to refuse it.
 */
export declare function seal<T extends Record<string, unknown>>(document: T): T;
/** Whether the document's recorded `content_hash` equals its true hash. */
export declare function verifySeal(document: Record<string, unknown>): boolean;
/**
 * A ratio in [0,1] as an integer in [0,10000].
 *
 * Clamping rather than throwing is right at this boundary: scores from
 * statistical models can land a hair outside [0,1] through accumulated error,
 * and refusing to encode a 1.0000001 would fail a pipeline over nothing.
 * Rounding is half away from zero, matching the Rust bindings.
 */
export declare function toBasisPoints(ratio: number): number;
/** A signed ratio in [-1,1] as an integer in [-10000,10000]. */
export declare function toSignedBasisPoints(ratio: number): number;
/** Convert basis points back to a ratio. */
export declare function fromBasisPoints(bp: number): number;
/**
 * The current instant as RFC 3339 UTC with exactly millisecond precision.
 *
 * Fixed precision is a hashing requirement: a timestamp one binding renders
 * with microseconds and another with seconds produces two different content
 * hashes for the same document. `toISOString` already emits exactly this shape.
 */
export declare function timestamp(at?: Date): string;
/** Whether a string matches CP/1's fixed timestamp shape. */
export declare function isTimestamp(value: string): boolean;
//# sourceMappingURL=canonical.d.ts.map