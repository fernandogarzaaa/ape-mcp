export function appraise(emotion, persona, ctx) {
    const t = persona.traits;
    const { outcome } = ctx;
    // --- Surprise: prediction vs reality -------------------------------
    if (outcome.surprise > 0.5) {
        const weight = outcome.prediction.confidence; // confident + wrong hurts more
        emotion.adjust("confusion", 0.12 + outcome.surprise * 0.25 * weight);
        emotion.adjust("confidence", -(0.05 + outcome.surprise * 0.15 * weight));
        emotion.adjust("trust", -outcome.surprise * 0.08 * weight);
        // Curious personas find surprise interesting; others find it stressful.
        if (t.curiosity > 0.6)
            emotion.adjust("interest", 0.08);
        else
            emotion.adjust("stress", 0.06 * outcome.surprise);
    }
    else {
        emotion.adjust("confidence", 0.04 * (1 - outcome.surprise));
        emotion.adjust("confusion", -0.08);
        emotion.adjust("trust", 0.02);
    }
    // --- Errors --------------------------------------------------------
    if (outcome.errorPerceived) {
        const impact = 0.18 * (1.4 - t.resilience);
        emotion.adjust("frustration", impact);
        emotion.adjust("stress", impact * 0.7);
        emotion.adjust("trust", -0.1);
        emotion.adjust("satisfaction", -0.12);
    }
    // --- Nothing happened ---------------------------------------------
    if (outcome.prediction.expectsChange && !outcome.screenChanged) {
        // Clicking and seeing no response is uniquely maddening.
        emotion.adjust("frustration", 0.14 * (1.3 - t.patience));
        emotion.adjust("confusion", 0.1);
        emotion.adjust("confidence", -0.06);
    }
    // --- Latency -------------------------------------------------------
    const waitSeconds = outcome.perceivedLatencyMs / 1000;
    if (waitSeconds > 1) {
        const tolerance = 1 + t.patience * 4; // patient users tolerate ~5s
        const excess = Math.max(0, waitSeconds - tolerance);
        emotion.adjust("frustration", Math.min(0.2, excess * 0.05));
        emotion.adjust("interest", -Math.min(0.1, excess * 0.02));
    }
    // --- Progress & novelty -------------------------------------------
    if (ctx.madeProgress) {
        emotion.adjust("satisfaction", 0.1);
        emotion.adjust("confidence", 0.05);
        emotion.adjust("frustration", -0.08 * t.resilience);
    }
    if (ctx.novelScreen) {
        emotion.adjust("curiosity", 0.05 * t.curiosity);
        emotion.adjust("interest", 0.05);
    }
    else {
        // Going in circles is demoralizing.
        emotion.adjust("curiosity", -0.03);
    }
    // --- Effort & fatigue ---------------------------------------------
    const effortCost = 0.006 + ctx.cognitiveEffort * 0.02;
    emotion.adjust("fatigue", effortCost);
    if (emotion.get("fatigue") > 0.7) {
        // Tired operators get irritable and careless.
        emotion.adjust("frustration", 0.02);
        emotion.adjust("interest", -0.02);
    }
    // Frustration feeds stress; stress erodes confidence — a realistic spiral
    // that resilience dampens.
    if (emotion.get("frustration") > 0.6) {
        emotion.adjust("stress", 0.04 * (1.2 - t.resilience));
        emotion.adjust("confidence", -0.02);
    }
}
/**
 * Per-iteration decay rate toward baseline. Resilient personas normalize
 * faster; fatigue slows recovery.
 */
export function decayRate(persona, fatigue) {
    return 0.06 * (0.5 + persona.traits.resilience) * (1 - fatigue * 0.5);
}
//# sourceMappingURL=appraisal.js.map