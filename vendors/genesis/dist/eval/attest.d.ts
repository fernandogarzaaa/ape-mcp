/**
 * Third-party attestation for evidence bundles: the embedded-evaluator
 * primitive. An evaluator reviews a bundle and signs its digest with
 * Ed25519; anyone can later verify the bundle is unchanged and who
 * attested to it. Attestations live under `attestations/` and are
 * EXCLUDED from the digest, so multiple parties can attest independently
 * without invalidating each other.
 */
export interface Attestation {
    readonly signer: string;
    readonly bundle_digest: string;
    readonly signature: string;
    readonly key_fingerprint: string;
    readonly timestamp: string;
}
export declare function generateKeypair(): {
    privateKey: string;
    publicKey: string;
};
export declare function fingerprint(publicKeyPem: string): string;
/** Full-tree digest of a bundle directory, excluding `attestations/`. */
export declare function digestBundle(dir: string): string;
export declare function attestBundle(dir: string, signer: string, privateKeyPem: string): Attestation;
export interface AttestationCheck {
    readonly signer: string;
    readonly digest_match: boolean;
    readonly signature_valid: boolean | null;
    readonly detail: string;
}
export interface BundleVerification {
    readonly ok: boolean;
    readonly bundle_digest: string;
    readonly checks: readonly AttestationCheck[];
}
/**
 * Verify a bundle: recompute the digest, check every attestation's digest,
 * and validate signatures against the provided public keys (PEM strings).
 * With no keys, signatures report null (present but unverified) and overall
 * ok reflects digest consistency only. No attestations at all → not ok.
 */
export declare function verifyBundle(dir: string, publicKeys?: readonly string[]): BundleVerification;
//# sourceMappingURL=attest.d.ts.map