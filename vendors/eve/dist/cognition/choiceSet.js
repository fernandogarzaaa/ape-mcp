import { describeAction } from "../core/types.js";
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
export function heuristicChoiceSet(considered, chosenIndex, selectionRule, refused = []) {
    const candidates = [
        ...considered.map((s, rank) => ({
            action: { kind: "click", target: s.element },
            label: describeAction({ kind: "click", target: s.element }),
            eligible: true,
            rank,
            score: s.total,
        })),
        ...refused.map(({ score, reason }) => ineligibleCandidate(score, reason)),
    ];
    if (candidates.length === 1) {
        // A trivial selection carries no probability: retaining one would
        // violate the evidence contract (a single candidate is not a
        // distribution). Score is kept — it was genuinely computed.
        const [only] = candidates;
        const { probability: _dropped, ...rest } = only;
        void _dropped;
        return { kind: "deterministic-single", candidates: [rest], selectedIndex: 0, selectionRule };
    }
    return { kind: "heuristic-ordered", candidates, selectedIndex: chosenIndex, selectionRule };
}
/** Utility-policy choice record with the true softmax distribution. */
export function utilityChoiceSet(positive, probabilities, temperature, chosenIndex, refused = [], belowThreshold = []) {
    const candidates = [
        ...positive.map((u, i) => ({
            action: { kind: "click", target: u.element },
            label: describeAction({ kind: "click", target: u.element }),
            eligible: true,
            rank: i,
            score: u.utility,
            probability: probabilities[i],
        })),
        ...refused.map(({ score, reason }) => ineligibleCandidate(score, reason)),
        ...belowThreshold.map(({ score, reason }) => ({
            action: { kind: "click", target: score.element },
            label: describeAction({ kind: "click", target: score.element }),
            eligible: false,
            ineligibilityReason: reason,
            score: score.utility,
        })),
    ];
    if (positive.length === 1 && refused.length === 0 && belowThreshold.length === 0) {
        const [only] = candidates;
        const { probability: _dropped, ...rest } = only;
        void _dropped;
        return { kind: "deterministic-single", candidates: [rest], selectedIndex: 0 };
    }
    return { kind: "probabilistic", candidates, selectedIndex: chosenIndex, temperature };
}
/**
 * Ineligible candidates excluded before scoring (e.g. risk-refused
 * controls). Recorded so calibration knows what was available-but-barred,
 * distinct from never-considered.
 */
export function ineligibleCandidate(score, reason) {
    return {
        action: { kind: "click", target: score.element },
        label: describeAction({ kind: "click", target: score.element }),
        eligible: false,
        ineligibilityReason: reason,
        score: score.total,
    };
}
//# sourceMappingURL=choiceSet.js.map