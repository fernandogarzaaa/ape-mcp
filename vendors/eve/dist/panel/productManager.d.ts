import type { FindingSeverity } from "../core/types.js";
import type { ExperienceForecast } from "../forecasting/forecast.js";
import type { DesignCritique } from "./designCritic.js";
import type { ExecutiveReport } from "./moderator.js";
/**
 * Product Manager AI.
 *
 * Translates the moderator's synthesis, the forecast and the design critique
 * into product artifacts: a prioritized backlog of epics and user stories
 * with business-impact estimates and a phased roadmap. Prioritization uses a
 * transparent value/effort model (a RICE-style heuristic: reach × impact ×
 * confidence ÷ effort) so the ordering is inspectable, not arbitrary.
 */
export interface UserStory {
    readonly id: string;
    readonly title: string;
    readonly asA: string;
    readonly iWant: string;
    readonly soThat: string;
    readonly acceptanceCriteria: readonly string[];
    readonly severity: FindingSeverity;
}
export interface Epic {
    readonly id: string;
    readonly title: string;
    readonly problem: string;
    readonly businessImpact: string;
    /** RICE-style priority score; higher = do sooner. */
    readonly priorityScore: number;
    readonly estimatedCompletionLift: number;
    readonly stories: readonly UserStory[];
}
export interface RoadmapPhase {
    readonly phase: string;
    readonly focus: string;
    readonly epics: readonly string[];
}
export interface ProductPlan {
    readonly epics: readonly Epic[];
    readonly roadmap: readonly RoadmapPhase[];
    readonly northStar: string;
    readonly summary: string;
}
interface PMInput {
    executive: ExecutiveReport;
    forecast?: ExperienceForecast;
    critique?: DesignCritique;
}
export declare function buildProductPlan(input: PMInput): ProductPlan;
export {};
//# sourceMappingURL=productManager.d.ts.map