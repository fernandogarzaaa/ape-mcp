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
    /** Screen title or URL where struggle is predicted. */
    readonly location: string;
    /** 0..1 predicted probability a user struggles here. */
    readonly struggleProbability: number;
    /** What drives the prediction. */
    readonly signals: readonly string[];
    /** Personas that struggled here, if multi-session. */
    readonly affectedPersonas: readonly string[];
}
export interface AbandonmentForecast {
    readonly workflow: string;
    readonly abandonmentRisk: number;
    readonly reason: string;
}
export interface ConfidenceForecast {
    readonly location: string;
    /** Mean confidence drop observed on this screen. */
    readonly confidenceDrop: number;
}
export interface ImprovementForecast {
    readonly change: string;
    /** Estimated completion-rate lift, 0..1. */
    readonly estimatedLift: number;
    readonly rationale: string;
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