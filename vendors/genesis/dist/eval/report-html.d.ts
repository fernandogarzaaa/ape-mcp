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
/**
 * Escape a bundle-sourced value for HTML interpolation. Bundle files are
 * parsed with JSON.parse + casts only, so a crafted bundle can smuggle
 * markup in a "numeric" field (e.g. `"repetition": "<img src=x
 * onerror=...>"`). Every interpolated bundle value goes through escapeHtml,
 * even ones the type system claims are numbers.
 */
export declare function num(v: unknown): string;
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
 *
 * Arms are reconstructed from statistics.json plus the bundle's documented
 * directory layout: `treatment/`, `baseline/`, and `ablations/<sanitized>/`
 * (ablation + sanity arms). Every results.jsonl row is read — no silent
 * truncation: the rendered trial count always matches the authoritative
 * bundle, with the total shown in the Trials heading.
 */
export declare function renderHtmlFromBundle(dir: string): string;
export {};
//# sourceMappingURL=report-html.d.ts.map