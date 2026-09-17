import type { SessionResult } from "../engine/session.js";
/**
 * Experience regression: temporal and behavioral.
 *
 * Functional tests answer "does it still work?". EVE answers "is it still a
 * good experience?". Given a baseline session and a candidate session (same
 * persona, seed and goal, different build), this module compares the
 * *cognitive experience* — confidence, frustration, trust, completion time,
 * navigation efficiency, mistakes, learning — and flags regressions the
 * functional suite cannot see: the app still works, but now it takes more
 * clicks, causes hesitation, or reduces confidence (Sauro & Lewis 2012 on
 * UX metrics; this extends them with cognitive/affective metrics).
 */
export interface ExperienceMetrics {
    overallScore: number;
    completed: boolean;
    abandoned: boolean;
    steps: number;
    productiveSteps: number;
    durationMs: number;
    backtracks: number;
    revisitRatio: number;
    deadClicks: number;
    errors: number;
    surpriseRate: number;
    meanConfidence: number;
    peakFrustration: number;
    meanTrust: number;
    meanCognitiveLoadIndex: number | null;
    hesitationEvents: number;
}
export interface MetricDelta {
    metric: keyof ExperienceMetrics;
    baseline: number;
    candidate: number;
    /** Signed change candidate − baseline. */
    delta: number;
    /** True if the change is a regression (worse experience). */
    regression: boolean;
    /** Human-readable severity. */
    severity: "critical" | "major" | "minor" | "none";
}
export interface RegressionReport {
    baselineLabel: string;
    candidateLabel: string;
    deltas: MetricDelta[];
    regressions: MetricDelta[];
    /** Overall verdict. */
    verdict: "improved" | "unchanged" | "regressed";
    summary: string;
}
export declare function extractMetrics(result: SessionResult): ExperienceMetrics;
/**
 * Compare two sessions and produce a regression report. Thresholds are
 * relative; tiny stochastic differences are ignored.
 */
export declare function compareExperience(baseline: SessionResult, candidate: SessionResult, labels?: {
    baseline?: string;
    candidate?: string;
}): RegressionReport;
//# sourceMappingURL=regression.d.ts.map