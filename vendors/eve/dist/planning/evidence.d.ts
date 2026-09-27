import type { Percept } from "../core/types.js";
/**
 * Goal-evidence model (P0.4).
 *
 * Text matching is a proxy, not task completion. This module keeps the
 * backwards-compatible `successSignals: string[]` behavior (substring match)
 * but wraps every success claim in a `GoalEvidence` record that says HOW the
 * claim was established and how strong that evidence is.
 *
 * Strength ladder (weakest → strongest):
 * - "text-proxy": signal words appear in visible text (heuristic).
 * - "visual-confirmation": signal appears in *rendered* text, not in an
 *   accessibility fallback or an unactivated control label.
 * - "state-transition": the screen identity changed after an action AND the
 *   signal is present (arrival + wording, not wording alone).
 * - "destination-state": the URL/state matches a declared terminal state.
 * - "workflow-terminal": a workflow detector independently reports terminality.
 */
export type GoalEvidenceKind = "text-proxy" | "visual-confirmation" | "state-transition" | "destination-state" | "workflow-terminal";
export type GoalEvidenceStrength = "weak" | "moderate" | "strong";
export interface GoalEvidence {
    readonly kind: GoalEvidenceKind;
    readonly strength: GoalEvidenceStrength;
    /** Human-readable account of what was observed. */
    readonly detail: string;
    /** True when the claim rests on text alone with no causal evidence. */
    readonly textOnly: boolean;
}
export interface GoalAssessment {
    readonly achieved: boolean;
    readonly evidence: readonly GoalEvidence[];
    /** Advisory warnings (label-only match, start-screen text, etc.). */
    readonly warnings: readonly string[];
}
export declare function matchSignal(haystack: string, signal: string): boolean;
/**
 * Assess goal completion with evidence grading.
 *
 * `visibleHaystack` is the full visible-text match surface (backwards
 * compatible: includes accessibility fallbacks). `renderedHaystack` is the
 * visual-only text. When the signal matches only the former, the claim is
 * graded "text-proxy" with a warning instead of silently masquerading as
 * causal completion.
 */
export declare function assessGoal(opts: {
    signals: readonly string[];
    visibleHaystack: string;
    renderedHaystack?: string;
    screenChangedSinceAction?: boolean;
    atDestinationState?: boolean;
    workflowTerminal?: boolean;
    url?: string;
}): GoalAssessment;
/** Convenience: grade a percept pair without threading strings manually. */
export declare function assessGoalOnPercepts(opts: {
    signals: readonly string[];
    visibleText: string;
    percept: Percept;
    screenChangedSinceAction?: boolean;
    atDestinationState?: boolean;
    workflowTerminal?: boolean;
    url?: string;
}): GoalAssessment;
//# sourceMappingURL=evidence.d.ts.map