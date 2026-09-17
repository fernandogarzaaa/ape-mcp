/**
 * CP/1 transport: the signed envelope and the line-delimited JSON protocol.
 *
 * The envelope carries its payload as a **string**, not a nested object, so the
 * bytes that were hashed are exactly the bytes transmitted. Nesting the
 * document would let the receiver's JSON writer re-render it — different key
 * order, different escaping — and invalidate a hash that was correct when it
 * was computed.
 *
 * See `protocol/cp1/SPEC.md` section 6.
 */
export declare const ENVELOPE_SCHEMA = "cp1_signed_envelope";
export interface SignedEnvelope {
    readonly cp: "cp1";
    readonly schema: typeof ENVELOPE_SCHEMA;
    /** Canonical-form JSON of the document, as a string. */
    readonly payload: string;
    readonly sha256: string;
    /**
     * HMAC-SHA256 over `sha256`, keyed by the fleet secret. Optional: over a
     * stdio subprocess boundary the parent already controls the child, so
     * requiring a shared secret there would be ceremony without a threat.
     */
    readonly hmac?: string;
}
export type EnvelopeFailure = "bad-schema" | "hash-mismatch" | "signature-missing" | "signature-invalid" | "no-key-to-verify" | "malformed-payload" | "not-canonical" | "seal-broken";
export declare class EnvelopeError extends Error {
    readonly failure: EnvelopeFailure;
    constructor(failure: EnvelopeFailure);
    private static describe;
}
/**
 * Wrap a document for transport, sealing it first.
 *
 * @throws {CanonicalError} if the document cannot be canonically encoded, which
 * for CP/1 means it contains a float, a null or an undefined.
 */
export declare function sealEnvelope(document: Record<string, unknown>, fleetKey?: Buffer | string): SignedEnvelope;
/**
 * Verify an envelope and return the document it carries.
 *
 * Checks run outermost-first — schema, transport hash, signature, then the
 * document's own seal — so the cheapest rejection happens first.
 *
 * @throws {EnvelopeError} on any verification failure.
 */
export declare function openEnvelope(envelope: SignedEnvelope, fleetKey?: Buffer | string): Record<string, unknown>;
/**
 * Render an envelope as one line of the line-delimited JSON transport.
 *
 * The envelope itself is canonical too, so a reader can hash whole lines for a
 * transport-level audit trail.
 */
export declare function toLine(envelope: SignedEnvelope): string;
/** Parse one line of the line-delimited JSON transport. */
export declare function fromLine(line: string): SignedEnvelope;
//# sourceMappingURL=envelope.d.ts.map