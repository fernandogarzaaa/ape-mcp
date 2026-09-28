/**
 * Experiment runner: dataset → subject → evaluator → metrics → evidence → verdict.
 *
 * Each (task × repetition × seed) is a Trial. Each trial gets an Observation
 * from the evaluator and an EvidenceRecord with provenance + digest. Baselines
 * run over the same population for paired comparison. Ablations run as named
 * arms. Nothing collapses trials into an opaque score: raw trials ship in the
 * evidence bundle.
 */
import { type Runner } from "../evidence/runner.js";
import { type LoadedDataset } from "./dataset.js";
import type { EvalFinding, EvidenceRecord, MetricValue, Observation, PairedComparison, StatisticalResult, Trial, VerdictRecord } from "./types.js";
import type { EvalSpec } from "./spec.js";
export interface ArmResult {
    readonly arm: string;
    readonly trials: Trial[];
    readonly observations: Observation[];
    readonly evidence: EvidenceRecord[];
    readonly metrics: MetricValue[];
    readonly statistics: (StatisticalResult | null)[];
    /** Inter-rater agreement when the evaluator reports it (human + second rater). */
    readonly evaluator_agreement?: {
        readonly cohen_kappa: number | null;
        readonly n: number;
        readonly interpretation: string | null;
    } | null;
}
export interface ExperimentResult {
    readonly name: string;
    readonly dataset: LoadedDataset["info"];
    readonly spec_digest: string;
    readonly arms: ArmResult[];
    readonly comparisons: PairedComparison[];
    readonly verdict: VerdictRecord;
    readonly findings: EvalFinding[];
    readonly started_at: string;
    readonly ended_at: string;
}
export declare function runExperiment(spec: EvalSpec, options?: {
    stdinData?: string;
    runner?: Runner;
}): Promise<ExperimentResult>;
/** Legacy alias (kept for external callers): size-bounded output. */
export declare function redactUnknown(v: unknown): unknown;
/** Fail-closed execution gate: any error/timeout/nonzero exit is failed. */
export declare function isFailedExecution(out: {
    readonly error: string | null;
    readonly timed_out: boolean;
    readonly exit_code: number | null;
}): boolean;
/**
 * Size-bounded output carrier. Strings/JSON above the cap become a valid
 * envelope {truncated, excerpt, byte_count, digest} instead of `[object
 * Object]` (old JSON.parse(slice) fallback) — evidence is preserved and the
 * full content stays addressable by digest.
 */
export declare function truncateOutput(v: unknown): unknown;
/**
 * Recursively drop `undefined` (canonical JSON rejects it — stringify would
 * silently drop those fields and produce colliding digests). Keeps nulls.
 */
export declare function stripUndefined<T>(v: T): T;
//# sourceMappingURL=runner.d.ts.map