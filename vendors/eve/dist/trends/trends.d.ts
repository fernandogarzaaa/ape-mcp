/**
 * Continuous UX regression — track experience across a *series* of builds and
 * detect where it is improving, regressing, or holding steady. Where
 * `compareExperience` (src/regression) compares two sessions, this operates on
 * an ordered sequence of population studies (build 1 → build N) and turns each
 * tracked metric into a trend with a direction and a slope.
 */
import type { PopulationStudy } from "../population/population.js";
/** Metrics tracked across builds, with the direction of "good". */
export declare const TREND_METRICS: readonly [{
    readonly key: "successRate";
    readonly label: "Success rate";
    readonly higherIsBetter: true;
}, {
    readonly key: "dropoffRate";
    readonly label: "Drop-off rate";
    readonly higherIsBetter: false;
}, {
    readonly key: "overallScore";
    readonly label: "Overall score";
    readonly higherIsBetter: true;
}, {
    readonly key: "confidence";
    readonly label: "Confidence";
    readonly higherIsBetter: true;
}, {
    readonly key: "frustration";
    readonly label: "Frustration";
    readonly higherIsBetter: false;
}, {
    readonly key: "trust";
    readonly label: "Trust";
    readonly higherIsBetter: true;
}, {
    readonly key: "medianSteps";
    readonly label: "Median steps to complete";
    readonly higherIsBetter: false;
}];
export type TrendMetricKey = (typeof TREND_METRICS)[number]["key"];
export type TrendDirection = "improved" | "regressed" | "stable";
export interface MetricTrend {
    readonly metric: TrendMetricKey;
    readonly label: string;
    readonly higherIsBetter: boolean;
    readonly series: readonly number[];
    readonly first: number;
    readonly last: number;
    /** last − first (raw, not direction-adjusted). */
    readonly delta: number;
    /** Least-squares slope per build. */
    readonly slope: number;
    readonly direction: TrendDirection;
}
export interface BuildSnapshot {
    readonly label: string;
    readonly metrics: Readonly<Record<TrendMetricKey, number>>;
}
export interface TrendReport {
    readonly builds: readonly string[];
    readonly trends: readonly MetricTrend[];
    readonly regressions: readonly MetricTrend[];
    readonly improvements: readonly MetricTrend[];
    readonly verdict: "improving" | "regressing" | "mixed" | "stable";
    readonly summary: string;
    readonly generatedAt: string;
}
/** Extract the tracked metrics from a population study. */
export declare function metricsFromStudy(study: PopulationStudy): Record<TrendMetricKey, number>;
/**
 * Analyze a trend across an ordered series of build snapshots (oldest first).
 * Accepts either raw snapshots or population studies.
 */
export declare function analyzeTrends(builds: readonly (BuildSnapshot | {
    label: string;
    study: PopulationStudy;
})[]): TrendReport;
//# sourceMappingURL=trends.d.ts.map