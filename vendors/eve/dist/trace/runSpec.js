/**
 * Paired-experiment run identity (Phase 13 counterfactual readiness).
 *
 * Future variant comparison ("same operator, same task, same start,
 * variant A vs B") must pair runs WITHOUT cloning runtime state. Pairing
 * needs only identity: two runs with equal `pairedRunKey` differ solely
 * by `variant` (and seed discipline, caller-managed). No causal inference
 * here — just the identity semantics paired experiments will key on.
 */
/**
 * Pairing key: runs sharing it are the same experimental unit and may be
 * contrasted across variants. Excludes `variant` (the contrast dimension)
 * and `runId` (a label, not identity). JSON-array encoding (not a joined
 * delimiter): numeric seed `7` and string seed `"7"` — or values containing
 * the delimiter — must never collide. Types are preserved (`7` vs `"7"`
 * differ), because seed type changes the RNG stream.
 */
export function pairedRunKey(spec) {
    return JSON.stringify([
        spec.operatorId ?? null,
        spec.taskId ?? null,
        spec.startUrl,
        spec.seed,
        spec.persona ?? null,
        spec.behaviorModelVersion ?? null,
        spec.parameterSetVersion ?? null,
    ]);
}
/** True when two specs are pairable variants of one experimental unit. */
export function isPairable(a, b) {
    return pairedRunKey(a) === pairedRunKey(b) && (a.variant ?? null) !== (b.variant ?? null);
}
//# sourceMappingURL=runSpec.js.map