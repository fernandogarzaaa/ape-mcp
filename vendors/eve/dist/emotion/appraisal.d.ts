import type { PredictionOutcome } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
import type { EmotionalState } from "./emotionalState.js";
/**
 * Appraisal: the mapping from events to emotional change.
 *
 * Grounded in appraisal theory — an event's emotional impact depends on how
 * it relates to the operator's goals and expectations, modulated by
 * personality (persona traits):
 *
 * - Expectation violations raise confusion and dent confidence/trust.
 * - Confirmed predictions build confidence and satisfaction.
 * - Visible errors spike frustration and stress, scaled by (1 - resilience).
 * - Waiting drains patience: perceived latency converts to frustration.
 * - Every action costs a little energy; hard/confusing steps cost more.
 */
export interface AppraisalContext {
    readonly outcome: PredictionOutcome;
    /** Did this step make measurable progress toward the goal? */
    readonly madeProgress: boolean;
    /** Was the perceived screen novel (never seen this session)? */
    readonly novelScreen: boolean;
    /** Estimated cognitive effort of the step, 0..1 (reading load, choices). */
    readonly cognitiveEffort: number;
}
export declare function appraise(emotion: EmotionalState, persona: Persona, ctx: AppraisalContext): void;
/**
 * Per-iteration decay rate toward baseline. Resilient personas normalize
 * faster; fatigue slows recovery.
 */
export declare function decayRate(persona: Persona, fatigue: number): number;
//# sourceMappingURL=appraisal.d.ts.map