/**
 * Metrics engine: composable, pluggable measurements over trials.
 *
 * Built-ins cover quality, reliability, performance, cost, agent, retrieval,
 * classification families. Custom metrics register via `registerMetric`.
 * Metrics never throw on missing data — they return null (→ INCONCLUSIVE).
 */
import type { Observation, Trial } from "./types.js";
export type MetricInput = {
    readonly trials: readonly Trial[];
    readonly observations: readonly Observation[];
};
export type MetricFn = (input: MetricInput) => number | null;
export declare function registerMetric(name: string, description: string, fn: MetricFn, unit?: string): void;
export declare function metricNames(): string[];
export declare function computeMetric(name: string, input: MetricInput): {
    value: number | null;
    unit?: string;
};
export interface RetrievalTrialStats {
    /** False when there is no gold to judge against; p/r/f1 are null then. */
    readonly judged: boolean;
    readonly p: number | null;
    readonly r: number | null;
    readonly f1: number | null;
}
export declare function retrievalTrialStats(retrievedRaw: unknown, relevantRaw: unknown): RetrievalTrialStats;
/** F1 from defined precision/recall; 0 when both defined but disjoint, null when undefined. */
export declare function retrievalF1(p: number | null, r: number | null): number | null;
/** Per-trial retrieval values for statistics (judged trials only). */
export declare function trialRetrievalValues(observations: readonly {
    details?: Record<string, unknown>;
}[], which: "p" | "r" | "f1"): number[];
/** Numeric details-field values for statistics (e.g. faithfulness). */
export declare function trialDetailValues(observations: readonly {
    details?: Record<string, unknown>;
}[], field: string): number[];
export declare function percentile(values: number[], p: number): number | null;
/** Binary classification metrics from (predicted, actual) pairs. */
export declare function classificationMetrics(pairs: readonly {
    predicted: boolean;
    actual: boolean;
}[]): {
    accuracy: number | null;
    precision: number | null;
    recall: number | null;
    f1: number | null;
};
/**
 * ROC-AUC via the Mann-Whitney U statistic. Null when there are no pairs or
 * only one class is present (ranking a single class is undefined, not 0.5-by-fiat
 * in the metric — callers that need a default must choose it explicitly).
 */
export declare function rocAuc(pairs: readonly {
    score: number;
    actual: boolean;
}[]): number | null;
/**
 * PR-AUC as average precision: rank by score descending, average precision
 * at each true positive. Null when there are no pairs or no positives.
 */
export declare function prAuc(pairs: readonly {
    score: number;
    actual: boolean;
}[]): number | null;
/**
 * Expected calibration error: bin scores into `bins` equal-width buckets and
 * average |accuracy − confidence| weighted by bucket mass. Lower is better,
 * so gate it with `<=` thresholds. Null without scored pairs.
 */
export declare function expectedCalibrationError(pairs: readonly {
    score: number;
    actual: boolean;
}[], bins?: number): number | null;
//# sourceMappingURL=metrics.d.ts.map