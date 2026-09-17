/**
 * Verdict model for system evaluation.
 *
 * SUPPORTED | FALSIFIED | INCONCLUSIVE | INVALID | UNTESTED.
 * Every verdict states claim boundaries: what was tested, what was NOT
 * tested, dataset, sample size, conditions, metrics, uncertainty.
 */
import type { Claim, MetricValue, VerdictRecord } from "./types.js";
export declare function decideVerdict(input: {
    claim?: Claim;
    metrics: readonly MetricValue[];
    thresholds?: Record<string, string>;
    datasetLabel: string;
    datasetDigest: string;
    sampleSize: number;
    repetitions: number;
    conditions: Record<string, unknown>;
    insufficientEvidence?: VerdictRecord["verdict"];
}): VerdictRecord;
//# sourceMappingURL=verdict.d.ts.map