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
//# sourceMappingURL=runner.d.ts.map