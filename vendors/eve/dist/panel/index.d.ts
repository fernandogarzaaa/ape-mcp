export type { CritiqueItem, DesignCritique, Heuristic } from "./designCritic.js";
export { critiqueDesign } from "./designCritic.js";
export type { DevTicket } from "./developer.js";
export { generateTickets, toGitHubIssues, toJiraIssues, toLinearIssues, toMarkdownTasks, } from "./developer.js";
export type { ConsensusIssue, Disagreement, ExecutiveReport } from "./moderator.js";
export { moderatePanel } from "./moderator.js";
export type { Epic, ProductPlan, RoadmapPhase, UserStory } from "./productManager.js";
export { buildProductPlan } from "./productManager.js";
import type { SessionResult } from "../engine/session.js";
import { type ExperienceForecast } from "../forecasting/forecast.js";
import type { DesignCritique } from "./designCritic.js";
import { type DevTicket } from "./developer.js";
import { type ExecutiveReport } from "./moderator.js";
import { type ProductPlan } from "./productManager.js";
export interface PanelResult {
    readonly executive: ExecutiveReport;
    readonly critique: DesignCritique;
    readonly forecast: ExperienceForecast;
    readonly plan: ProductPlan;
    readonly tickets: readonly DevTicket[];
}
/**
 * Run the full AI panel over a set of sessions: independent design critique,
 * experience forecast, moderator consensus, product plan, and developer
 * tickets. This is the end-to-end "team of AIs" pass.
 */
export declare function runPanel(sessions: readonly SessionResult[]): PanelResult;
//# sourceMappingURL=index.d.ts.map