import type { CognitiveContext, Decision, DecisionPolicy } from "./cognition.js";
/** Uniform random choice among interactive controls; waits when none exist. */
export declare class RandomPolicy implements DecisionPolicy {
    readonly name = "random-baseline";
    decide(ctx: CognitiveContext): Promise<Decision>;
}
/**
 * Goal-greedy choice: first untried control whose label overlaps the goal,
 * else first untried control, else wait. No salience weighting, no
 * softmax, no memory beyond tried-marks.
 */
export declare class GoalGreedyPolicy implements DecisionPolicy {
    readonly name = "goal-greedy-baseline";
    decide(ctx: CognitiveContext): Promise<Decision>;
}
//# sourceMappingURL=baselines.d.ts.map