import type { Percept, PredictionOutcome } from "../core/types.js";
/**
 * Trust model.
 *
 * Humans build trust in a system gradually and lose it abruptly (trust
 * asymmetry; Slovic 1993). Trust in automation decomposes into
 * predictability, dependability and faith (Lee & See 2004; Muir 1987). EVE
 * tracks component trust dimensions that evolve from perceived events and
 * roll up into an overall trust level that feeds the emotional state and,
 * through it, decisions (low trust → verification behavior).
 *
 * Components (0..1):
 * - predictability: did outcomes match predictions?
 * - consistency: does the UI behave the same way across encounters?
 * - errorRecovery: when things went wrong, was there a way forward?
 * - feedbackQuality: did the system acknowledge actions?
 * - securityPerception: do visible cues signal a safe, credible system?
 *
 * Update rates are asymmetric: negative evidence moves trust faster than
 * positive evidence.
 */
export interface TrustComponents {
    predictability: number;
    consistency: number;
    errorRecovery: number;
    feedbackQuality: number;
    securityPerception: number;
}
export interface TrustSample {
    step: number;
    overall: number;
    components: TrustComponents;
}
export declare class TrustModel {
    private readonly components;
    private readonly history;
    constructor(initial?: number);
    private nudge;
    /**
     * Update trust from one interaction outcome and the resulting screen.
     */
    update(outcome: PredictionOutcome, perceivedError: boolean, gaveFeedback: boolean): void;
    /** Consistency signal from revisiting a screen that looked the same. */
    reinforceConsistency(sameAsRemembered: boolean): void;
    /**
     * Security perception from visible credibility cues on a screen: HTTPS in
     * the URL bar, absence of scary permission asks, presence of trust markers.
     * Purely perceptual — no network inspection.
     */
    observeSecurityCues(percept: Percept): void;
    overall(): number;
    snapshot(): TrustComponents;
    record(step: number): void;
    timeline(): readonly TrustSample[];
}
//# sourceMappingURL=trust.d.ts.map