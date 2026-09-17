import type { Persona } from "../personas/persona.js";
/**
 * The operator's continuously evolving emotional state.
 *
 * Every value is 0..1. Values change only through appraisal
 * ({@link ../emotion/appraisal.js}) and natural decay toward a persona-derived
 * baseline — no module mutates emotions directly, which keeps the dynamics
 * interpretable and reportable as a timeline.
 */
export interface EmotionVector {
    confidence: number;
    frustration: number;
    trust: number;
    confusion: number;
    curiosity: number;
    fatigue: number;
    satisfaction: number;
    interest: number;
    stress: number;
}
export declare const EMOTION_KEYS: readonly (keyof EmotionVector)[];
export interface EmotionSample {
    readonly step: number;
    readonly timestamp: number;
    readonly values: Readonly<EmotionVector>;
}
export declare class EmotionalState {
    private readonly values;
    private readonly baseline;
    private readonly history;
    constructor(persona: Persona);
    get(key: keyof EmotionVector): number;
    snapshot(): Readonly<EmotionVector>;
    /** Apply a delta to one emotion, clamped to [0, 1]. */
    adjust(key: keyof EmotionVector, delta: number): void;
    /**
     * Set one emotion directly (clamped). Used by phase-2 subsystems that own
     * a dimension outright — e.g. the trust model drives `trust`. No-op-safe:
     * phase-1 sessions never call this, so default dynamics are unchanged.
     */
    override(key: keyof EmotionVector, value: number): void;
    /**
     * Natural regression toward baseline. Called once per loop iteration;
     * `rate` is how far toward baseline each emotion moves (fatigue never
     * decays during a session — tiredness only accumulates).
     */
    decay(rate: number): void;
    record(step: number, timestamp: number): void;
    timeline(): readonly EmotionSample[];
    /** Mean of a single emotion across the recorded timeline. */
    mean(key: keyof EmotionVector): number;
    /** Peak value of an emotion across the recorded timeline. */
    peak(key: keyof EmotionVector): number;
}
//# sourceMappingURL=emotionalState.d.ts.map