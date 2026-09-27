import type { EvidenceProvenance } from "../core/types.js";
import type { SessionResult } from "../engine/session.js";
/**
 * Experience forecasting.
 *
 * From one or more observed sessions, forecast where *future* users are
 * likely to struggle, which workflows risk abandonment, which screens erode
 * confidence, and what changes would most improve completion. This is
 * predictive UX analytics grounded in observed behavior rather than opinion:
 * screens that repeatedly produced surprise, dead clicks, latency spikes,
 * confidence drops or abandonment across sessions are extrapolated into
 * risk forecasts, weighted by how many personas hit them.
 */
export interface StruggleForecast {
    /** Screen title or URL where struggle is forecast. */
    readonly location: string;
    /**
     * Heuristic struggle RISK INDEX 0..1 (P1.8) — a hand-weighted combination
     * of friction events and persona breadth, NOT an empirically fitted
     * probability and NOT a causal estimate. Kept 0..1 internally for
     * comparability; reports must render it as an index.
     */
    readonly struggleProbability: number;
    /** Alias with honest naming; identical value. Prefer in new code. */
    readonly struggleIndex: number;
    /** What drives the forecast. */
    readonly signals: readonly string[];
    /** Personas that struggled here, if multi-session. */
    readonly affectedPersonas: readonly string[];
    readonly provenance: EvidenceProvenance;
}
export interface AbandonmentForecast {
    readonly workflow: string;
    /** Heuristic abandonment risk index 0..1 (observed abandonment share) — not causal. */
    readonly abandonmentRisk: number;
    readonly reason: string;
    readonly provenance: EvidenceProvenance;
}
export interface ConfidenceForecast {
    readonly location: string;
    /** Mean confidence drop observed on this screen. */
    readonly confidenceDrop: number;
}
export interface ImprovementForecast {
    readonly change: string;
    /**
     * Heuristic estimated completion LIFT INDEX 0..1 (P1.8) — scenario
     * arithmetic over observed friction, not a causal lift estimate.
     */
    readonly estimatedLift: number;
    readonly rationale: string;
    readonly provenance: EvidenceProvenance;
}
export interface ExperienceForecast {
    readonly struggles: readonly StruggleForecast[];
    readonly abandonmentRisks: readonly AbandonmentForecast[];
    readonly confidenceDrains: readonly ConfidenceForecast[];
    readonly recommendedChanges: readonly ImprovementForecast[];
    readonly summary: string;
}
/**
 * Forecast future UX risk from a set of observed sessions (one or many
 * personas / seeds). More sessions → higher-confidence forecasts.
 */
export declare function forecastExperience(sessions: readonly SessionResult[]): ExperienceForecast;
//# sourceMappingURL=forecast.d.ts.map