/**
 * Behavioral parameter registry (Phase 5 calibration substrate).
 *
 * Answers "which behavioral parameters generated this run?" without
 * grepping source. Every entry is classified:
 *
 * - STRUCTURAL: semantics/invariants defining what EVE is. Not fittable
 *   (fitting them would change the instrument's meaning, not its tuning).
 * - EMPIRICAL: hand-authored today, potentially fittable against human
 *   behavioral data once a calibration dataset exists. Bounds are sane
 *   prior ranges for future fitting — explicitly NOT fitted values.
 * - POLICY: deployment/configuration behavior. Set per run, never fitted.
 *
 * READ-ONLY in the frozen model (v1.0.0): this registry DESCRIBES values,
 * it does not configure them. Nothing here is wired as a live knob —
 * doing so would change behavior and require a model version bump.
 * `snapshotParameters()` serializes the set for dataset manifests.
 */
export type ParameterClassification = "STRUCTURAL" | "EMPIRICAL" | "POLICY";
export interface ParameterBounds {
    readonly min: number;
    readonly max: number;
}
export interface ParameterDefinition {
    /** Stable id, e.g. "motor.clickScatterPxPerUnit". */
    readonly id: string;
    /** Owning module, e.g. "browser/humanizer". */
    readonly owner: string;
    readonly classification: ParameterClassification;
    readonly value: number | string;
    readonly units?: string;
    /**
     * Prior range placeholder for future fitting (EMPIRICAL only).
     * Hand-authored sanity bounds — not posteriors, not fitted.
     */
    readonly bounds?: ParameterBounds;
    readonly description: string;
    /** Source pointer for auditability, e.g. "src/browser/humanizer.ts:61". */
    readonly source: string;
}
export interface ParameterSet {
    readonly parameterSetVersion: string;
    readonly parameters: readonly ParameterDefinition[];
}
/**
 * The frozen v1.0.0 empirical + structural + policy parameter surface.
 * Values mirror the implementation; `source` points at each one. The
 * regression test `parameters.test.ts` re-derives every computable value
 * from its source function so mirrors cannot silently drift.
 */
export declare const BEHAVIOR_PARAMETERS: readonly ParameterDefinition[];
export declare function getParameter(id: string): ParameterDefinition | undefined;
export declare function parametersByClass(classification: ParameterClassification): readonly ParameterDefinition[];
/** Serializable snapshot answering "which parameters generated this run?". */
export declare function snapshotParameters(parameterSetVersion: string): {
    readonly parameterSetVersion: string;
    readonly parameters: readonly {
        id: string;
        value: number | string;
    }[];
};
//# sourceMappingURL=parameters.d.ts.map