/**
 * Exploration strategies shape how the operator prioritizes when the current
 * goal is open-ended exploration rather than one concrete task.
 */
export type ExplorationStrategy = "curious" | "systematic" | "goal-directed";
export interface StrategyWeights {
    /** Multiplier on novelty in salience scoring. */
    noveltyWeight: number;
    /** Multiplier on goal relevance in salience scoring. */
    goalWeight: number;
    /** Probability of scrolling to survey the full page before acting. */
    surveyBias: number;
    /** Tendency to finish one screen before moving on. */
    completionBias: number;
}
export declare function strategyWeights(strategy: ExplorationStrategy): StrategyWeights;
//# sourceMappingURL=strategies.d.ts.map