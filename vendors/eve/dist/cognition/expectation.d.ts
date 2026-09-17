import type { Percept, Prediction, VisibleElement } from "../core/types.js";
/**
 * Expectation engine.
 *
 * Extends the phase-1 prediction (a single expected-outcome string plus
 * signals) into a full multi-dimensional expectation, per predictive-
 * processing accounts of perception (Clark 2013): before acting, the
 * operator commits to what should happen, what should appear, how long it
 * should take, where they should arrive, what visual change should occur,
 * and what feedback should appear. After observation each dimension is
 * scored, yielding an Expectation Match Score, Expectation Surprise, and a
 * per-violation severity (expectation-disconfirmation; Oliver 1980).
 */
export interface RichExpectation {
    readonly base: Prediction;
    /** Where the operator expects to arrive: same screen, new screen, or a specific place. */
    readonly destination: "same" | "new" | "back" | {
        titleHint: string;
    };
    /** Expected perceived latency in ms (Doherty threshold ≈ 400ms baseline). */
    readonly expectedLatencyMs: number;
    /** Whether a visible layout/content change is expected. */
    readonly expectsVisualChange: boolean;
    /** Whether explicit feedback (message/confirmation) is expected. */
    readonly expectsFeedback: boolean;
}
export interface ExpectationScore {
    /** 0..1, 1 = reality matched the expectation exactly. */
    readonly matchScore: number;
    /** 0..1, prediction error. */
    readonly surprise: number;
    /** 0..1, how badly the most-violated dimension missed. */
    readonly violationSeverity: number;
    /** Which dimensions were violated. */
    readonly violations: readonly ExpectationDimension[];
    readonly perceivedLatencyMs: number;
}
export type ExpectationDimension = "outcome" | "destination" | "latency" | "visual-change" | "feedback";
/**
 * Build a rich expectation from a base prediction and the element being
 * acted on. Latency expectations scale with the perceived "weight" of the
 * action — navigation and submission feel like they should take longer than
 * toggling a checkbox.
 */
export declare function buildExpectation(base: Prediction, target: VisibleElement | null, actionKind: string): RichExpectation;
/**
 * Score a rich expectation against what actually happened.
 */
export declare function scoreExpectation(expectation: RichExpectation, before: Percept, after: Percept, perceivedLatencyMs: number): ExpectationScore;
/**
 * Tracks streaks of expectation violations. Repeated violations compound
 * frustration and trust damage beyond isolated ones (learned
 * unpredictability).
 */
export declare class ViolationStreak {
    private streak;
    private total;
    register(score: ExpectationScore): number;
    current(): number;
    totalViolations(): number;
}
//# sourceMappingURL=expectation.d.ts.map