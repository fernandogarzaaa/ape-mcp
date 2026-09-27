/**
 * Research-grade metric primitives (Phase 11 calibration substrate).
 *
 * Small, pure, honestly-labeled functions for future trajectory comparison.
 * Each states its kind in its docstring:
 *
 * - descriptive: summarizes observed data, claims nothing beyond it.
 * - simulation-sample: computed over simulated operators, not humans.
 *
 * Do NOT present these as calibrated, validated, or human-grounded: they
 * are the vocabulary a future calibration objective can be written in,
 * not evidence of agreement. No thresholds, no verdicts, no scores.
 */
/** Fraction of human choices appearing in EVE's top-k ranked candidates. */
export declare function topKAgreement<T>(humanChoices: readonly T[], eveTopK: ReadonlyArray<readonly T[]>, equals?: (a: T, b: T) => boolean): number;
/**
 * Mean squared error between predicted probabilities and binary outcomes.
 * Lower is better; 0.25 is the no-information baseline. Requires REAL
 * model probabilities (utility softmax) — never synthesize inputs.
 */
export declare function brierScore(predicted: readonly number[], actual: readonly (0 | 1)[]): number;
/**
 * Spearman rank correlation in [-1, 1]. Compares ORDERINGS (e.g. predicted
 * vs observed screen-friction ranks), never magnitudes. Null when
 * undefined (fewer than 2 points or zero variance).
 */
export declare function spearmanRankCorrelation(xs: readonly number[], ys: readonly number[]): number | null;
/**
 * L1 distance between two transition distributions (maps of edge → count).
 * 0 = identical support and mass; 2 = disjoint. Descriptive only.
 */
export declare function transitionDivergenceL1(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number;
/**
 * Mean absolute log-duration error in natural-log units. Log scale because
 * human dwell times are heavy-tailed: being 2× off on a 30s dwell matters
 * like being 2× off on a 3s dwell. Non-positive durations are skipped
 * (explicit missing-data handling, not imputation).
 */
export declare function meanLogDurationError(predictedMs: readonly number[], actualMs: readonly number[]): number | null;
//# sourceMappingURL=metrics.d.ts.map