/**
 * Deterministic, rule-based segmentation of a simulated population into
 * behavioural cohorts — the "expected user segments" a UX researcher reports.
 *
 * Segmentation is intentionally interpretable (first-matching rule wins)
 * rather than a black-box clustering, so every operator's segment can be
 * explained from its outcome and emotional end-state.
 */
import type { EmotionVector } from "../emotion/emotionalState.js";
/** The minimal per-operator shape the classifier needs. */
export interface SegmentableOperator {
    /** Reached the goal, or (for open-ended runs) finished without abandoning. */
    readonly completed: boolean;
    readonly abandoned: boolean;
    readonly steps: number;
    readonly overall: number;
    readonly emotions: EmotionVector;
}
export interface Segment {
    readonly key: string;
    readonly name: string;
    readonly description: string;
    readonly size: number;
    readonly share: number;
    readonly meanScore: number;
    readonly meanSteps: number;
}
/** Classify a single operator into a segment key. */
export declare function classifySegment(op: SegmentableOperator): string;
/** Group operators into segments, sorted by size (largest first). */
export declare function segmentPopulation(operators: readonly SegmentableOperator[]): Segment[];
//# sourceMappingURL=segments.d.ts.map