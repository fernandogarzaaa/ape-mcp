import type { SessionResult } from "../engine/session.js";
import { type ExperienceReport } from "./report.js";
export { renderHtml } from "./html.js";
export { renderMarkdown } from "./markdown.js";
export { renderPanelMarkdown } from "./panelReport.js";
export type { ExperienceReport } from "./report.js";
export { buildReport } from "./report.js";
/** JSON rendering strips raw screenshot buffers (kept in HTML instead). */
export declare function renderJson(report: ExperienceReport): string;
export interface WrittenReport {
    readonly html: string;
    readonly markdown: string;
    readonly json: string;
}
/** Build a report from a session result and write all three formats. */
export declare function writeReports(result: SessionResult, outputDir: string): Promise<WrittenReport>;
//# sourceMappingURL=index.d.ts.map