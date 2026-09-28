/**
 * The ledger: hash-chained, append-only, single-writer.
 *
 * v1's `audit_log` was an ordinary SQLite table whose `timestamp` column was
 * supplied by its writer, and any process holding the file handle could edit a
 * verdict or backdate a contract. The ledger is the stated long-term asset —
 * the calibration data — and an asset that can be silently edited is not an
 * audit record.
 *
 * Chaining does not make tampering impossible; a local file with a determined
 * owner never can be. It makes tampering *detectable*, which is the achievable
 * and sufficient property. `verifyChain()` reports the exact `seq` where the
 * chain breaks.
 *
 * Every write goes through `#append`. There is no other path — the
 * choke-point discipline `adam-governance` documents and v1 lacked.
 */
/**
 * True when the optional better-sqlite3 dependency is installed and its
 * native binding loads. Ledger-backed tests and CLI paths use this to
 * degrade gracefully instead of failing at module load.
 */
export declare function isLedgerAvailable(): boolean;
/** An assurance audit of a verifier, or a recorded evaluation/benchmark run. */
export type EntryType = "VERIFIER_AUDITED" | "EVALUATION_RECORDED" | "BENCHMARK_RECORDED";
export interface LedgerEntry {
    readonly seq: number;
    readonly prev_hash: string;
    readonly entry_hash: string;
    readonly entry_type: EntryType;
    readonly contract_hash: string | null;
    readonly payload: unknown;
    readonly recorded_at: number;
}
export declare class Ledger {
    #private;
    constructor(path?: string, now?: () => number);
    close(): void;
    /**
     * Record an assurance audit of a verifier.
     *
     * `subject_hash` identifies the (verifier, suite) pair rather than a contract.
     * Chaining these matters for the same reason it matters for verdicts: "we
     * audited this verifier on that date and it was clean" is a claim someone may
     * later want to have been true, and an editable record cannot support it.
     */
    recordVerifierAudit(subject_hash: string, payload: unknown): LedgerEntry;
    /**
     * Record a universal evaluation run (claim → experiment → verdict).
     * `subject_hash` identifies the (spec digest, dataset digest) pair.
     */
    recordEvaluation(subject_hash: string, payload: unknown): LedgerEntry;
    /** Record a benchmark run (named reusable evaluation). */
    recordBenchmark(subject_hash: string, payload: unknown): LedgerEntry;
    /**
     * Store a collector artifact, redacted, and return its digest.
     *
     * Redaction happens before hashing. Redacting afterwards would leave the
     * digest certifying content that is no longer what is stored.
     */
    putArtifact(content: string): string;
    getArtifact(digest: string): string | null;
    entries(filter?: {
        type?: EntryType;
        contract_hash?: string;
    }): LedgerEntry[];
    head(): LedgerEntry | null;
    size(): number;
    verifyChain(): ChainVerification;
    /** Full ledger as JSONL, for backup and out-of-band verification. */
    exportJsonl(): Generator<string>;
}
export interface ChainVerification {
    readonly ok: boolean;
    readonly entries: number;
    readonly head?: string | null;
    readonly brokenAt?: number;
    readonly reason?: string;
}
/** The hash input. Everything except `entry_hash` itself. */
export declare function computeEntryHash(entry: Omit<LedgerEntry, "entry_hash">): string;
//# sourceMappingURL=ledger.d.ts.map