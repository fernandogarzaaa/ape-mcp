/**
 * Offline single-file HTML reports, rendered FROM the evidence bundle.
 *
 * Every evidence bundle ships a `report.html`: verdict banner, metric
 * intervals, findings, comparisons, and an expandable per-trial explorer —
 * all inline CSS + vanilla JS, zero external resources, works from file://.
 * The bundle stays the source of truth; the HTML is a lens, never a
 * replacement. All interpolated strings are HTML-escaped (trial outputs
 * may contain markup or script tags).
 */
import type { ExperimentResult } from "./runner.js";
export declare function escapeHtml(s: string): string;
interface TrialRow {
    trial_id: string;
    task_id: string;
    repetition: number;
    subject: string;
    duration_ms: number;
    output: string;
    passed: boolean | null;
    score: number | string | null;
}
export declare function renderHtmlReport(result: ExperimentResult, trials?: readonly TrialRow[]): string;
/**
 * Regenerate the report from a bundle directory (verdict + metrics +
 * findings + statistics + results.jsonl). Used by `genesis report --html`.
 */
export declare function renderHtmlFromBundle(dir: string): string;
export {};
//# sourceMappingURL=report-html.d.ts.map