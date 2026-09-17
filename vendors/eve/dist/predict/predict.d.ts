/**
 * Predictive UX — extrapolate from a simulated population to what the broader
 * user base will experience, with confidence intervals. Predicts future
 * confusion, abandonment, onboarding failure, support contacts, and
 * accessibility issues.
 *
 * Proportion predictions use the Wilson score interval (better than the normal
 * approximation at small n and near 0/1), treating the simulated population as
 * a sample. Modeled rates (support contacts) carry an explicit heuristic band.
 */
import type { PopulationStudy } from "../population/population.js";
export type PredictionBasis = "observed-proportion" | "modeled";
export interface UXPredictionItem {
    readonly metric: string;
    /** Point estimate (a proportion in [0,1], or a rate when `unit` says so). */
    readonly estimate: number;
    readonly low: number;
    readonly high: number;
    readonly unit: "proportion" | "per-100-users";
    readonly basis: PredictionBasis;
    readonly note: string;
}
export interface PredictedStruggle {
    readonly screen: string;
    readonly predictedConfusion: number;
    readonly reason: string;
}
export interface UXPrediction {
    /** The study's target URL (identity — unchanged by display labels). */
    readonly url: string;
    /** Human-facing target name for report headers. Optional — renderers fall
     * back to `url`, so pre-existing consumers/constructors are unaffected. */
    readonly label?: string;
    readonly size: number;
    readonly predictions: readonly UXPredictionItem[];
    readonly struggleForecasts: readonly PredictedStruggle[];
    readonly generatedAt: string;
}
/** Wilson score interval for a binomial proportion (z = 1.96 → 95%). */
export declare function wilsonInterval(successes: number, n: number, z?: number): {
    low: number;
    high: number;
};
/**
 * Predict the UX the wider user base will experience from a population study.
 */
export declare function predictUX(study: PopulationStudy): UXPrediction;
//# sourceMappingURL=predict.d.ts.map