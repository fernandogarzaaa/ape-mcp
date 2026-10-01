/**
 * Predictive UX — simulation estimates from a simulated population, with
 * HONEST uncertainty labels (P1.5–P1.7).
 *
 * What these numbers are:
 * - Simulation estimates: Wilson intervals quantify uncertainty about the
 *   SIMULATION sample (25 simulated operators), NOT a 95% confidence
 *   interval for real users. Simulated personas are not a random sample of
 *   the human population, so no population inference is claimed.
 * - Heuristic operational estimates (support contacts, confusion indices):
 *   hand-weighted formulas, explicitly labeled, with an explicit ±30% band
 *   that is a display convention, not a fitted variance.
 * - Human-calibrated estimates: null until fitted against real human data
 *   (see `humanCalibratedEstimate` + `calibrationStatus`).
 */
import type { EvidenceProvenance } from "../core/types.js";
import type { PopulationStudy } from "../population/population.js";
export type PredictionBasis = "observed-proportion" | "modeled";
/** Whether this estimate can support inference about real users. */
export type CalibrationStatus = "uncalibrated-heuristic" | "human-calibrated" | "externally-validated";
export interface UXPredictionItem {
    readonly metric: string;
    /** Point estimate (a proportion in [0,1], or a rate when `unit` says so). */
    readonly estimate: number;
    readonly low: number;
    readonly high: number;
    readonly unit: "proportion" | "per-100-users";
    readonly basis: PredictionBasis;
    readonly note: string;
    /** Epistemic status — always explicit, never a bare "probability". */
    readonly provenance: EvidenceProvenance;
    /** Population-inference readiness. */
    readonly calibrationStatus: CalibrationStatus;
    /** Fitted human estimate when calibration exists; null until then. */
    readonly humanCalibratedEstimate: number | null;
}
export interface PredictedStruggle {
    readonly screen: string;
    /**
     * Heuristic confusion RISK INDEX 0..1 (P1.5/P1.8) — a hand-weighted
     * score, NOT a calibrated probability. Named without "probability"
     * deliberately; reports must render it as an index.
     */
    readonly predictedConfusion: number;
    readonly reason: string;
    readonly provenance: EvidenceProvenance;
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
 * Heuristic simulation estimates from a population study.
 *
 * Produces simulation-sample ranges and heuristic scenario scores with
 * explicit provenance — never population inference about real users.
 */
export declare function predictUX(study: PopulationStudy): UXPrediction;
//# sourceMappingURL=predict.d.ts.map