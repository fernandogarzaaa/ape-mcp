import type { ApplicationMemory, SessionMemoryRecord } from "./longTerm.js";
/**
 * Cross-session learning analysis.
 *
 * HONESTY NOTE (P1.9): `recognizedScreens`, `recalledPaths` and
 * `recognitionRecallRatio` are INTERNAL memory-strength proxies (retained
 * affordance thresholds 0.15/0.5), NOT experimentally measured human
 * recognition/recall. They are useful for tracking the model's own state
 * but must never be reported as human recognition-vs-recall findings. The
 * `BehavioralMemoryProbe` interface below is the future-compatible slot for
 * real behavioral tests; nothing is called "measured" until such a probe
 * actually runs.
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
    /** Mean affordance strength 0..1 (NOT a recall fraction — see note). */
    retention: number;
    /** INTERNAL PROXY: screens with any affordance strength > 0.15. Not measured recognition. */
    recognizedScreens: number;
    /** INTERNAL PROXY: screens with any affordance strength > 0.5. Not measured recall. */
    recalledPaths: number;
    /**
     * INTERNAL PROXY ratio of the two strength heuristics above — not a human
     * recognition-vs-recall experiment (Nielsen heuristic #6 cited as design
     * inspiration only).
     */
    recognitionRecallRatio: number;
    /** Per-session efficiency series (steps), first→latest. */
    stepsSeries: number[];
    /** Per-session duration series (ms), first→latest. */
    durationSeries: number[];
    /** Per-session confidence series. */
    confidenceSeries: number[];
}
/**
 * Future-compatible slot for ACTUAL behavioral memory tests (P1.9): a probe
 * the operator performs (e.g. "which of these screens have you seen?",
 * "navigate back unaided") whose outcome is measured, not inferred from
 * internal strengths. No built-in probes yet — this type reserves the API.
 */
export interface BehavioralMemoryProbe {
    readonly kind: "recognition-test" | "recall-test";
    readonly description: string;
    run: () => Promise<{
        passed: boolean;
        detail: string;
    }>;
}
export interface RecognitionMetric {
    readonly measured: false;
    readonly proxyValue: number;
    readonly note: string;
}
export interface RecallMetric {
    readonly measured: false;
    readonly proxyValue: number;
    readonly note: string;
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