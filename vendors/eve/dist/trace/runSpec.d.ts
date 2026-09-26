/**
 * Paired-experiment run identity (Phase 13 counterfactual readiness).
 *
 * Future variant comparison ("same operator, same task, same start,
 * variant A vs B") must pair runs WITHOUT cloning runtime state. Pairing
 * needs only identity: two runs with equal `pairedRunKey` differ solely
 * by `variant` (and seed discipline, caller-managed). No causal inference
 * here — just the identity semantics paired experiments will key on.
 */
export interface RunSpec {
    /** Caller-assigned run label; null when anonymous. */
    readonly runId?: string | null;
    readonly operatorId?: string | null;
    readonly taskId?: string | null;
    readonly startUrl: string;
    readonly seed: number | string;
    readonly persona?: string;
    /** Variant name, e.g. "control" / "redesign-B". Null = unassigned. */
    readonly variant?: string | null;
    readonly behaviorModelVersion?: string;
    readonly parameterSetVersion?: string;
}
/**
 * Pairing key: runs sharing it are the same experimental unit and may be
 * contrasted across variants. Excludes `variant` (the contrast dimension)
 * and `runId` (a label, not identity). JSON-array encoding (not a joined
 * delimiter): numeric seed `7` and string seed `"7"` — or values containing
 * the delimiter — must never collide. Types are preserved (`7` vs `"7"`
 * differ), because seed type changes the RNG stream.
 */
export declare function pairedRunKey(spec: RunSpec): string;
/** True when two specs are pairable variants of one experimental unit. */
export declare function isPairable(a: RunSpec, b: RunSpec): boolean;
//# sourceMappingURL=runSpec.d.ts.map