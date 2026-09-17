import type { ApplicationMemory, SessionMemoryRecord } from "./longTerm.js";
/**
 * Cross-session learning analysis.
 *
 * Computes the metrics the mission calls for from an application's session
 * history: Learning Rate (power law of practice; Newell & Rosenbloom 1981),
 * Retention, Memory Recall, a Forgetting Curve, and Recognition-vs-Recall.
 * Also emits an inline SVG learning-curve chart for reports.
 */
export interface LearningMetrics {
    sessions: number;
    /** Power-law exponent α in T(n) = T(1)·n^(−α); higher = faster learning. */
    learningRate: number;
    /** R² of the power-law fit (how power-law-like the improvement is). */
    learningFit: number;
    /** Fraction of first-session task time the latest session takes (lower is better). */
    timeReductionRatio: number;
    /** Confidence trend: latest minus first session mean confidence. */
    confidenceTrend: number;
    /** Fraction of prior-known affordances still recallable now (0..1). */
    retention: number;
    /** Distinct screens the operator can recognize on sight. */
    recognizedScreens: number;
    /** Screens whose navigation path the operator can recall unaided. */
    recalledPaths: number;
    /**
     * Recognition-vs-recall ratio: recognition ≥ recall for humans (Nielsen
     * heuristic #6). > 1 means the UI leans on recognition (good).
     */
    recognitionRecallRatio: number;
    /** Per-session efficiency series (steps), first→latest. */
    stepsSeries: number[];
    /** Per-session duration series (ms), first→latest. */
    durationSeries: number[];
    /** Per-session confidence series. */
    confidenceSeries: number[];
}
export declare function computeLearningMetrics(memory: ApplicationMemory): LearningMetrics;
/**
 * Model an Ebbinghaus forgetting curve for a given retention trait, sampled
 * at N session gaps. Returns retention fraction 0..1 per elapsed session.
 */
export declare function forgettingCurve(retentionTrait: number, gaps?: number): Array<{
    elapsed: number;
    retention: number;
}>;
/** Inline SVG line chart of a per-session series (for HTML reports). */
export declare function renderLearningCurveSvg(metrics: LearningMetrics, options?: {
    width?: number;
    height?: number;
}): string;
export type { SessionMemoryRecord };
//# sourceMappingURL=learning.d.ts.map