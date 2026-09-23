import type { ChoiceCandidate, ChoiceSet } from "../core/types.js";
import type { SalienceScore } from "./salience.js";
import type { UtilityScore } from "./utility.js";
/**
 * Choice-set recording (Phase 3 calibration substrate).
 *
 * What alternatives were available at the moment of decision — recorded,
 * never invented. The evidence ladder is strict:
 *
 * - `heuristic-ordered`: cascade order + eligibility + salience scores.
 *   NO probabilities (the cascade never computes any).
 * - `probabilistic`: utility scores + real softmax probabilities.
 * - `deterministic-single`: exactly one eligible candidate.
 *
 * Builders are pure mappings over data the policy already computed: they
 * consume no RNG and change no decision. Branches that select without
 * scoring (dialogs, loading, abandonment) record nothing — absence explicit.
 */
/** Heuristic cascade choice record from the considered salience slice. */
export declare function heuristicChoiceSet(considered: readonly SalienceScore[], chosenIndex: number, selectionRule: string, refused?: readonly {
    score: SalienceScore;
    reason: string;
}[]): ChoiceSet;
/** Utility-policy choice record with the true softmax distribution. */
export declare function utilityChoiceSet(positive: readonly UtilityScore[], probabilities: readonly number[], temperature: number, chosenIndex: number, refused?: readonly {
    score: SalienceScore;
    reason: string;
}[], belowThreshold?: readonly {
    score: UtilityScore;
    reason: string;
}[]): ChoiceSet;
/**
 * Ineligible candidates excluded before scoring (e.g. risk-refused
 * controls). Recorded so calibration knows what was available-but-barred,
 * distinct from never-considered.
 */
export declare function ineligibleCandidate(score: SalienceScore, reason: string): ChoiceCandidate;
//# sourceMappingURL=choiceSet.d.ts.map