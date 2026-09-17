import type { Finding, Percept } from "../core/types.js";
/**
 * Design Critic — an expert reviewer independent of the human simulation.
 *
 * Where the simulated operator judges the experience *behaviorally* (by
 * using the product), the Design Critic performs *expert inspection*: a
 * heuristic evaluation (Nielsen & Molich 1990; Nielsen's 10 usability
 * heuristics) plus typography, layout, hierarchy, microcopy, forms,
 * navigation and onboarding heuristics, applied statically to each captured
 * screen. Combining behavioral testing with expert inspection is the classic
 * dual-method evaluation strategy — each finds problems the other misses
 * (Hertzum & Jacobsen 2001, the evaluator effect).
 *
 * Deterministic and offline by default; an optional LLM pass can be layered
 * via the `llm-critic` plugin during the session.
 */
export type Heuristic = "visibility-of-status" | "match-real-world" | "user-control" | "consistency-standards" | "error-prevention" | "recognition-not-recall" | "flexibility-efficiency" | "aesthetic-minimalist" | "error-recovery" | "help-documentation" | "typography" | "layout-hierarchy" | "microcopy" | "forms" | "navigation" | "onboarding";
export interface CritiqueItem {
    readonly heuristic: Heuristic;
    readonly severity: "critical" | "major" | "minor";
    readonly title: string;
    readonly detail: string;
    readonly location: string;
    readonly recommendation: string;
}
export interface DesignCritique {
    readonly items: readonly CritiqueItem[];
    readonly byHeuristic: Readonly<Record<string, number>>;
    /** 0..100 heuristic-inspection score (higher is better). */
    readonly inspectionScore: number;
    readonly summary: string;
}
/**
 * Critique a set of captured screens. `behavioralFindings` (from the
 * operator's run) are folded in so the critique can corroborate or extend
 * behavioral evidence, but the heuristic checks stand on their own.
 */
export declare function critiqueDesign(screens: readonly Percept[], behavioralFindings?: readonly Finding[]): DesignCritique;
//# sourceMappingURL=designCritic.d.ts.map