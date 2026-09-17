import { clamp01 } from "../core/random.js";
export const EMOTION_KEYS = [
    "confidence",
    "frustration",
    "trust",
    "confusion",
    "curiosity",
    "fatigue",
    "satisfaction",
    "interest",
    "stress",
];
export class EmotionalState {
    values;
    baseline;
    history = [];
    constructor(persona) {
        this.baseline = {
            confidence: persona.traits.baseConfidence,
            frustration: 0.05,
            trust: 0.6,
            confusion: 0.1,
            curiosity: persona.traits.curiosity,
            fatigue: 0.05,
            satisfaction: 0.5,
            interest: 0.5 + persona.traits.curiosity * 0.3,
            stress: 0.1,
        };
        for (const key of EMOTION_KEYS) {
            const override = persona.disposition[key];
            if (typeof override === "number")
                this.baseline[key] = clamp01(override);
        }
        this.values = { ...this.baseline };
    }
    get(key) {
        return this.values[key];
    }
    snapshot() {
        return { ...this.values };
    }
    /** Apply a delta to one emotion, clamped to [0, 1]. */
    adjust(key, delta) {
        this.values[key] = clamp01(this.values[key] + delta);
    }
    /**
     * Set one emotion directly (clamped). Used by phase-2 subsystems that own
     * a dimension outright — e.g. the trust model drives `trust`. No-op-safe:
     * phase-1 sessions never call this, so default dynamics are unchanged.
     */
    override(key, value) {
        this.values[key] = clamp01(value);
    }
    /**
     * Natural regression toward baseline. Called once per loop iteration;
     * `rate` is how far toward baseline each emotion moves (fatigue never
     * decays during a session — tiredness only accumulates).
     */
    decay(rate) {
        for (const key of EMOTION_KEYS) {
            if (key === "fatigue")
                continue;
            const target = this.baseline[key];
            this.values[key] = clamp01(this.values[key] + (target - this.values[key]) * rate);
        }
    }
    record(step, timestamp) {
        this.history.push({ step, timestamp, values: this.snapshot() });
    }
    timeline() {
        return this.history;
    }
    /** Mean of a single emotion across the recorded timeline. */
    mean(key) {
        if (this.history.length === 0)
            return this.values[key];
        let sum = 0;
        for (const sample of this.history)
            sum += sample.values[key];
        return sum / this.history.length;
    }
    /** Peak value of an emotion across the recorded timeline. */
    peak(key) {
        let max = this.values[key];
        for (const sample of this.history)
            max = Math.max(max, sample.values[key]);
        return max;
    }
}
//# sourceMappingURL=emotionalState.js.map