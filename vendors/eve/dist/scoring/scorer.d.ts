import type { Modality } from "../core/registry.js";
import type { Finding, LoopIteration, Score, SessionUsage } from "../core/types.js";
import type { EmotionSample } from "../emotion/emotionalState.js";
import type { DiscoveredWorkflow, WorkflowNode } from "../workflow/graph.js";
/**
 * Scoring: converts the raw record of an experience session into 0..100
 * scores per dimension, each carrying explicit evidence.
 *
 * Philosophy: scores are *derived measurements*, never vibes. Every deduction
 * traces back to something that happened — an expectation violation, a
 * finding, an emotion excursion, wasted steps — and that trace ships with the
 * score as its evidence list.
 *
 * Phase 2 (registry-driven, modality-gated):
 * - The sixteen built-in dimensions are still computed by name, unchanged —
 *   but only when the session's modality is one the dimension `appliesTo`
 *   (registered in `dimensionRegistry`). A visual-only dimension on a
 *   textual session is *skipped, not vacuously passed*.
 * - Dimensions registered by domain packs (e.g. `mcp.*`) are scored by the
 *   generic rule {@link scoreFromFindings} — the single home of the
 *   severity penalty schedule — from findings in categories linked via
 *   `FindingCategoryEntry.scoresInto`, and only when such findings exist
 *   (evidence-gated: no evidence, no dimension).
 */
/** The one severity penalty schedule: critical 25 / major 12 / minor 4 / info 1. */
export declare const FINDING_SEVERITY_PENALTY: {
    readonly critical: 25;
    readonly major: 12;
    readonly minor: 4;
    readonly info: 1;
};
/** The slice of a finding the generic dimension rule needs. */
export type FindingEvidence = Pick<Finding, "severity" | "title">;
/**
 * The generic registered-dimension rule: 100 minus severity penalties, with
 * the driving findings cited. This is the *only* implementation of that
 * rule — the MCP harness retired its parallel copy in Phase 2.
 */
export declare function scoreFromFindings(dimension: Score["dimension"], findings: readonly FindingEvidence[]): Score;
export interface ScoringInput {
    readonly iterations: readonly LoopIteration[];
    readonly findings: readonly Finding[];
    readonly emotionTimeline: readonly EmotionSample[];
    readonly workflows: readonly DiscoveredWorkflow[];
    readonly workflowNodes: readonly WorkflowNode[];
    readonly revisitRatio: number;
    readonly usage: SessionUsage;
    readonly goalAchieved: boolean;
    readonly abandoned: boolean;
    /**
     * The session's perceptual modality. When provided, dimensions whose
     * registry `appliesTo` excludes it are skipped, and applicable registered
     * dimensions with evidence are scored. Omit for phase-1 behavior (every
     * built-in computed, no registered extras) — used by tests that score
     * dimension math in isolation.
     */
    readonly modality?: Modality;
}
export declare function computeScores(input: ScoringInput): Score[];
//# sourceMappingURL=scorer.d.ts.map