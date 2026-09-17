import type { FindingSeverity } from "../core/types.js";
import type { SessionResult } from "../engine/session.js";
import type { ExperienceForecast } from "../forecasting/forecast.js";
import type { DesignCritique } from "./designCritic.js";
/**
 * Moderator AI.
 *
 * After a panel of personas has each used the product, the Moderator plays
 * the role of the research lead synthesizing a multi-participant study: it
 * compares every session, finds consensus (issues multiple personas hit),
 * surfaces disagreements (issues only one persona hit, or where personas
 * diverged), and produces a single executive report. Consensus across
 * independent evaluators is the strongest usability signal (Hertzum &
 * Jacobsen 2001, the evaluator effect: aggregating evaluators is what makes
 * discount usability reliable).
 */
export interface ConsensusIssue {
    readonly title: string;
    readonly category: string;
    readonly severity: FindingSeverity;
    /** Fraction of personas that encountered this issue, 0..1. */
    readonly agreement: number;
    readonly personas: readonly string[];
    readonly url: string;
    readonly representativeDescription: string;
}
export interface Disagreement {
    readonly topic: string;
    readonly detail: string;
}
export interface ExecutiveReport {
    readonly personaCount: number;
    readonly meanOverallScore: number;
    readonly scoreRange: {
        min: number;
        max: number;
    };
    readonly completionRate: number;
    readonly abandonmentRate: number;
    readonly consensusIssues: readonly ConsensusIssue[];
    readonly disagreements: readonly Disagreement[];
    readonly perPersona: ReadonlyArray<{
        persona: string;
        overall: number;
        endReason: string;
        topFinding: string | null;
    }>;
    readonly executiveSummary: string;
    readonly topPriorities: readonly string[];
}
interface PanelInput {
    sessions: readonly SessionResult[];
    critique?: DesignCritique;
    forecast?: ExperienceForecast;
}
/**
 * Synthesize a panel of sessions into one executive report.
 */
export declare function moderatePanel(input: PanelInput): ExecutiveReport;
export {};
//# sourceMappingURL=moderator.d.ts.map