import type { VisibleElement } from "../core/types.js";
import type { EmotionVector } from "../emotion/emotionalState.js";
import type { Persona } from "../personas/persona.js";
import type { SalienceScore } from "./salience.js";
/**
 * Utility-based decision model.
 *
 * Replaces heuristic weighted-picking with explicit expected-utility
 * evaluation over candidate actions, with softmax (Luce-choice) selection.
 * Feature weights are modulated by the operator's current emotional state,
 * closing the emotion → decision loop (affect-as-information; Schwarz &
 * Clore 1983):
 *
 * - High frustration  → exploration (curiosity weight) collapses, urgency
 *   rises, effort aversion rises — the operator beelines or bails.
 * - High confidence   → experimentation rises, risk aversion falls.
 * - Low trust         → risk aversion rises; verification behavior appears
 *   (double-checking before consequential actions).
 * - High fatigue      → effort and time aversion rise (least-effort choices).
 *
 * Risk is weighted asymmetrically relative to reward (loss aversion;
 * Kahneman & Tversky 1979). Motor effort follows a Fitts-style
 * distance/size cost (Fitts 1954).
 */
export interface DecisionWeights {
    expectedSuccess: number;
    reward: number;
    curiosity: number;
    risk: number;
    effort: number;
    time: number;
    urgency: number;
}
export declare function decisionWeights(persona: Persona, emotion: Readonly<EmotionVector>): DecisionWeights;
export interface UtilityFeatures {
    /** 0..1 belief the action will do something useful. */
    expectedSuccess: number;
    /** 0..1 goal progress value if it succeeds. */
    reward: number;
    /** 0..1 novelty / information value. */
    curiosity: number;
    /** 0..1 perceived risk (destructive/committing). */
    risk: number;
    /** 0..1 motor + cognitive effort cost. */
    effort: number;
    /** 0..1 anticipated time cost. */
    time: number;
}
export interface UtilityScore {
    readonly element: VisibleElement;
    readonly features: UtilityFeatures;
    readonly utility: number;
}
/** Fitts-style normalized motor effort for acquiring a target. */
export declare function motorEffort(el: VisibleElement, from: {
    x: number;
    y: number;
} | null): number;
/**
 * Convert phase-1 salience scores into utility features, evaluate utility,
 * and return candidates ranked by utility (descending).
 */
export declare function evaluateUtilities(scored: readonly SalienceScore[], weights: DecisionWeights, options?: {
    pointer?: {
        x: number;
        y: number;
    } | null;
    /** 0..1 belief-from-memory boost per element text (learned paths). */
    memorySuccess?: (el: VisibleElement) => number;
}): UtilityScore[];
/**
 * Softmax choice over utilities. Temperature shrinks as urgency rises —
 * pressured humans behave more deterministically (Easterbrook 1959,
 * attentional narrowing under arousal).
 */
export declare function softmaxChoice(candidates: readonly UtilityScore[], weights: DecisionWeights, sample: () => number): UtilityScore;
/**
 * Should the operator double-check before this action? Low-trust operators
 * verify consequential actions (Lee & See 2004: distrust induces monitoring).
 */
export declare function wantsVerification(risk: number, emotion: Readonly<EmotionVector>, persona: Persona): boolean;
//# sourceMappingURL=utility.d.ts.map