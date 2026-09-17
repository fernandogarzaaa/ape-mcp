import { clamp01 } from "../core/random.js";
export function decisionWeights(persona, emotion) {
    const t = persona.traits;
    const frustration = emotion.frustration;
    const confidence = emotion.confidence;
    const fatigue = emotion.fatigue;
    const trust = emotion.trust;
    return {
        expectedSuccess: 1.0 + confidence * 0.3,
        reward: 1.2 + frustration * 0.6, // frustrated users chase goal progress harder
        curiosity: clamp01(t.curiosity * (1 - frustration * 0.9)) * (0.5 + t.experimentation * 0.7) +
            confidence * 0.25,
        // Loss aversion baseline ~2x reward weight, shifted by disposition/state.
        risk: 2.0 * (1.3 - t.riskTolerance) * (1.15 - confidence * 0.3) * (1.2 - trust * 0.3),
        effort: 0.3 + fatigue * 0.8 + frustration * 0.3,
        time: 0.2 + (1 - t.patience) * 0.5 + fatigue * 0.3,
        urgency: frustration * 0.5 + (1 - t.patience) * 0.3,
    };
}
/** Fitts-style normalized motor effort for acquiring a target. */
export function motorEffort(el, from) {
    const w = Math.max(4, Math.min(el.box.width, el.box.height));
    const cx = el.box.x + el.box.width / 2;
    const cy = el.box.y + el.box.height / 2;
    const d = from ? Math.hypot(cx - from.x, cy - from.y) : 300;
    const indexOfDifficulty = Math.log2(d / w + 1); // Fitts ID
    return clamp01(indexOfDifficulty / 6);
}
/**
 * Convert phase-1 salience scores into utility features, evaluate utility,
 * and return candidates ranked by utility (descending).
 */
export function evaluateUtilities(scored, weights, options = {}) {
    const results = scored.map((s) => {
        const memory = options.memorySuccess?.(s.element) ?? 0;
        const features = {
            expectedSuccess: clamp01(0.35 + s.goalRelevance * 0.3 + s.prominence * 0.15 + memory * 0.4),
            reward: clamp01(s.goalRelevance),
            curiosity: clamp01(s.novelty * (0.5 + s.prominence * 0.3)),
            risk: clamp01(s.risk),
            effort: motorEffort(s.element, options.pointer ?? null),
            time: clamp01(s.element.text.split(/\s+/).length / 30 + (s.risk > 0.4 ? 0.3 : 0)),
        };
        const utility = weights.expectedSuccess * features.expectedSuccess +
            weights.reward * features.reward +
            weights.curiosity * features.curiosity -
            weights.risk * features.risk -
            weights.effort * features.effort -
            weights.time * features.time;
        return { element: s.element, features, utility };
    });
    return results.sort((a, b) => b.utility - a.utility);
}
/**
 * Softmax choice over utilities. Temperature shrinks as urgency rises —
 * pressured humans behave more deterministically (Easterbrook 1959,
 * attentional narrowing under arousal).
 */
export function softmaxChoice(candidates, weights, sample) {
    if (candidates.length === 0)
        throw new Error("softmaxChoice: no candidates");
    const temperature = Math.max(0.12, 0.55 - weights.urgency * 0.35);
    const max = candidates[0].utility;
    const exps = candidates.map((c) => Math.exp((c.utility - max) / temperature));
    const total = exps.reduce((a, b) => a + b, 0);
    let roll = sample() * total;
    for (let i = 0; i < candidates.length; i++) {
        roll -= exps[i];
        if (roll <= 0)
            return candidates[i];
    }
    return candidates[candidates.length - 1];
}
/**
 * Should the operator double-check before this action? Low-trust operators
 * verify consequential actions (Lee & See 2004: distrust induces monitoring).
 */
export function wantsVerification(risk, emotion, persona) {
    if (risk < 0.35)
        return false;
    const verifyDrive = (1 - emotion.trust) * 0.6 + (1 - persona.traits.riskTolerance) * 0.4;
    return verifyDrive > 0.55;
}
//# sourceMappingURL=utility.js.map