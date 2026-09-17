import type { SessionResult } from "../engine/session.js";
/**
 * Report assembly: derives the narrative pieces (executive summary,
 * recommendations, quick wins) from a session result. Renderers (markdown,
 * html, json) consume this structure.
 */
export interface ExperienceReport {
    readonly result: SessionResult;
    readonly generatedAt: string;
    readonly executiveSummary: string;
    readonly overallScore: number;
    readonly quickWins: readonly string[];
    readonly longTermImprovements: readonly string[];
}
export declare function buildReport(result: SessionResult): ExperienceReport;
export declare function pct(v: number): string;
//# sourceMappingURL=report.d.ts.map