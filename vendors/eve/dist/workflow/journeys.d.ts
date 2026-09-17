import type { LoopIteration } from "../core/types.js";
import type { WorkflowKind } from "./catalog.js";
import type { WorkflowGraph } from "./graph.js";
/**
 * User-journey discovery.
 *
 * Where workflow detection classifies individual screens, journey discovery
 * recovers the *sequence* the operator actually performed to accomplish a
 * higher-order goal — "how do I become a paying customer?" — with no
 * predefined script. This is task analysis from observed behavior (Card,
 * Moran & Newell 1983, GOMS), reconstructed post-hoc from the interaction
 * trace.
 *
 * A discovered journey is the ordered list of screens visited plus the
 * actions that connected them, annotated with where friction occurred
 * (errors, dead clicks, backtracks, hesitation), and whether the journey
 * reached a terminal/confirmation state.
 */
export interface JourneyStep {
    readonly step: number;
    readonly url: string;
    readonly title: string;
    readonly workflowKind: WorkflowKind;
    readonly action: string;
    readonly rationale: string;
    /** Friction observed at this step. */
    readonly friction: readonly string[];
    readonly frustration: number;
}
export interface DiscoveredJourney {
    readonly goal: string;
    readonly steps: readonly JourneyStep[];
    readonly reachedTerminal: boolean;
    readonly abandoned: boolean;
    /** Screens (by title) that formed the critical path, deduplicated. */
    readonly path: readonly string[];
    /** Number of steps that were pure friction (no forward progress). */
    readonly wastedSteps: number;
    /** Total simulated time for the journey, ms. */
    readonly durationMs: number;
    /** Friction points ranked by severity, for reporting. */
    readonly frictionPoints: readonly {
        title: string;
        reasons: string[];
        frustration: number;
    }[];
}
/**
 * Reconstruct the journey the operator took toward their goal from the
 * iteration trace and the discovered workflow graph.
 */
export declare function discoverJourney(goal: string, iterations: readonly LoopIteration[], graph: WorkflowGraph, outcome: {
    goalAchieved: boolean;
    abandoned: boolean;
}): DiscoveredJourney;
/**
 * Infer a natural-language description of the journey the operator was on,
 * from the sequence of workflow kinds encountered. Used when no explicit
 * goal was given ("the operator appears to be signing up and paying").
 */
export declare function inferJourneyIntent(journey: DiscoveredJourney): string;
//# sourceMappingURL=journeys.d.ts.map