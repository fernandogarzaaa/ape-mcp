import type { PopulationDistribution } from "../population/index.js";
/**
 * Experiment manifest (Phase 14 calibration substrate).
 *
 * An experiment that can be re-run from a manifest instead of undocumented
 * CLI flags. Minimal by design: identity, tasks, environment, frozen model
 * reference, population, variants, seeds, and the dataset split contract.
 * No execution engine here — a manifest DESCRIBES an experiment; runners
 * consume it. Held-out evaluation is a split-design requirement, not an
 * optional analysis choice.
 */
export type PopulationKind = "balanced" | "distribution";
export interface ExperimentPopulation {
    readonly kind: PopulationKind;
    readonly size: number;
    readonly seed: number | string;
    readonly distribution?: PopulationDistribution;
}
export interface ExperimentVariant {
    readonly name: string;
    /** Free-form session-option overrides, e.g. `{ cognitive: true }`. */
    readonly sessionOptions?: Readonly<Record<string, unknown>>;
}
export type DatasetSplitMethod = "held-out-users" | "held-out-tasks" | "held-out-interfaces" | "random-split";
export interface ExperimentDatasetSplit {
    readonly method: DatasetSplitMethod;
    /** Fraction reserved for held-out evaluation, 0..1 exclusive. */
    readonly heldOutFraction: number;
    readonly seed: number | string;
}
export interface ExperimentEnvironment {
    readonly adapter: string;
    readonly viewport?: {
        width: number;
        height: number;
    };
    readonly locale?: string;
}
export interface ExperimentSpec {
    readonly experimentId: string;
    readonly taskIds: readonly string[];
    readonly environment: ExperimentEnvironment;
    readonly behaviorModelVersion: string;
    readonly parameterSetVersion: string;
    readonly population: ExperimentPopulation;
    readonly variants: readonly ExperimentVariant[];
    readonly seeds: readonly (number | string)[];
    readonly datasetSplit: ExperimentDatasetSplit;
}
/** Structural validation: returns error strings, empty when valid. */
export declare function validateExperimentSpec(spec: ExperimentSpec): string[];
/** Deterministic serialization for manifest freezing and review. */
export declare function renderExperimentJson(spec: ExperimentSpec): string;
//# sourceMappingURL=manifest.d.ts.map