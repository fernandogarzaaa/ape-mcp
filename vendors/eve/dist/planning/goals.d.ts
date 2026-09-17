/**
 * Goal management.
 *
 * The operator always has a current goal ("sign up for an account", "explore
 * the application") and may push transient subgoals ("dismiss this cookie
 * banner", "recover from this error"). Goals carry keywords that drive
 * salience, and satisfaction signals that let the engine detect completion
 * from perception alone.
 */
export type GoalStatus = "active" | "achieved" | "abandoned";
export interface Goal {
    readonly id: string;
    readonly description: string;
    /** Keywords that make screen elements goal-relevant. */
    readonly keywords: readonly string[];
    /** Signals whose appearance on screen suggests the goal is achieved. */
    readonly successSignals: readonly string[];
    status: GoalStatus;
    /** Steps spent pursuing this goal. */
    effortSteps: number;
    readonly priority: number;
}
export declare function createGoal(description: string, options?: {
    keywords?: readonly string[];
    successSignals?: readonly string[];
    priority?: number;
}): Goal;
export declare class GoalStack {
    private readonly stack;
    private readonly completed;
    constructor(root: Goal);
    get current(): Goal;
    get root(): Goal;
    /** The current subgoal, if the operator has pushed one atop the root. */
    get subgoal(): Goal | null;
    push(goal: Goal): void;
    /** Mark the current goal resolved and pop it (root goal is never popped). */
    resolve(status: Exclude<GoalStatus, "active">): void;
    tickEffort(): void;
    history(): readonly Goal[];
    depth(): number;
}
//# sourceMappingURL=goals.d.ts.map