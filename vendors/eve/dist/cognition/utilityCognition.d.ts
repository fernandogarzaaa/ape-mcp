import type { ExplorationStrategy, StrategyWeights } from "../planning/strategies.js";
import type { CognitiveContext, Decision } from "./cognition.js";
import { HeuristicCognition } from "./heuristicCognition.js";
/**
 * Utility-based decision policy.
 *
 * Reuses the entire phase-1 priority cascade (dialogs, loading, bailout,
 * reading, strong-goal match, form filling/submission, scroll, backtrack,
 * give up) but replaces the salience-softmax affordance choice with explicit
 * expected-utility evaluation and Luce-choice selection, with feature
 * weights modulated by the current emotional state, trust, fatigue and
 * cross-session recall.
 *
 * Everything else — including keyboard-only handling and hesitation — is
 * inherited unchanged, so this policy is a drop-in decision-model upgrade
 * rather than a rewrite. Enable it with `policy: new UtilityCognition()`.
 */
export declare class UtilityCognition extends HeuristicCognition {
    readonly name = "utility";
    constructor(strategy?: ExplorationStrategy);
    protected chooseAffordance(ctx: CognitiveContext, goalKeywords: readonly string[], _weights: StrategyWeights, effortBase: number, sig: string): Decision | null;
    private lastPointer;
}
//# sourceMappingURL=utilityCognition.d.ts.map