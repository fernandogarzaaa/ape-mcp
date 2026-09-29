/**
 * Persona model.
 *
 * A persona is a bundle of behavioral parameters that modulate every part of
 * the simulation: how fast the operator reads, how accurately they click, how
 * long they tolerate friction, how willing they are to experiment, how much
 * they remember. Traits are dimensionless 0..1 values unless noted otherwise;
 * downstream modules translate them into concrete quantities (milliseconds,
 * pixels, probabilities).
 */
export const DEFAULT_ACCESSIBILITY = {
    colorVision: "typical",
    minComfortableFontPx: 11,
    keyboardOnly: false,
    motorDifficultyFactor: 1,
};
const TRAIT_KEYS = [
    "readingSpeedWpm",
    "clickAccuracy",
    "typingAccuracy",
    "motorSpeed",
    "memoryRetention",
    "riskTolerance",
    "patience",
    "attentionSpan",
    "curiosity",
    "baseConfidence",
    "experimentation",
    "keyboardPreference",
    "techLiteracy",
    "learningRate",
    "distractibility",
    "resilience",
    "thoroughness",
];
/** Average adult reading speed baseline. */
export const BASELINE_TRAITS = {
    readingSpeedWpm: 240,
    clickAccuracy: 0.85,
    typingAccuracy: 0.85,
    motorSpeed: 0.6,
    memoryRetention: 0.65,
    riskTolerance: 0.45,
    patience: 0.55,
    attentionSpan: 0.6,
    curiosity: 0.5,
    baseConfidence: 0.55,
    experimentation: 0.45,
    keyboardPreference: 0.3,
    techLiteracy: 0.55,
    learningRate: 0.55,
    distractibility: 0.2,
    resilience: 0.55,
    thoroughness: 0.5,
};
/** Build a complete persona from a partial spec, validating trait ranges. */
export function definePersona(spec) {
    // Backwards compat (P1.2): specs authored before `typingAccuracy` existed
    // inherit it from pointer precision unless explicitly overridden.
    const traits = {
        ...BASELINE_TRAITS,
        ...spec.traits,
        typingAccuracy: spec.traits?.typingAccuracy ?? spec.traits?.clickAccuracy ?? BASELINE_TRAITS.typingAccuracy,
    };
    for (const key of TRAIT_KEYS) {
        const value = traits[key];
        if (typeof value !== "number" || Number.isNaN(value)) {
            throw new Error(`Persona "${spec.name}": trait ${key} must be a number`);
        }
        if (key === "readingSpeedWpm") {
            if (value < 40 || value > 1200) {
                throw new Error(`Persona "${spec.name}": readingSpeedWpm ${value} out of range 40..1200`);
            }
        }
        else if (value < 0 || value > 1) {
            throw new Error(`Persona "${spec.name}": trait ${key}=${value} out of range 0..1`);
        }
    }
    return {
        name: spec.name,
        description: spec.description ?? "",
        traits,
        accessibility: { ...DEFAULT_ACCESSIBILITY, ...spec.accessibility },
        disposition: spec.disposition ?? {},
    };
}
/* ------------------------------------------------------------------ */
/* Trait → concrete behavior translation                              */
/* ------------------------------------------------------------------ */
/** Time to read `wordCount` words, in ms. Thoroughness gates skimming. */
export function readingTimeMs(persona, wordCount) {
    const effectiveWords = wordCount * (0.35 + 0.65 * persona.traits.thoroughness); // skimmers read a subset
    const msPerWord = 60_000 / persona.traits.readingSpeedWpm;
    return Math.max(120, effectiveWords * msPerWord);
}
/** Base pointer travel + settle time for one motor action, in ms. */
export function motorActionMs(persona) {
    const base = 1400 - persona.traits.motorSpeed * 1000; // 400..1400ms
    return base * persona.accessibility.motorDifficultyFactor;
}
/** Per-character typing interval in ms. */
export function typingIntervalMs(persona) {
    // ~40wpm (300ms/char) for slow typists up to ~110wpm (~110ms/char).
    const interval = 300 - persona.traits.motorSpeed * 190;
    return interval * persona.accessibility.motorDifficultyFactor;
}
/**
 * Standard deviation, in px, of click landing position around the intended
 * target center. Small targets plus low accuracy produce misclicks.
 */
export function clickScatterPx(persona) {
    return (1 - persona.traits.clickAccuracy) * 14 * persona.accessibility.motorDifficultyFactor;
}
/**
 * How many recent items fit in working memory. Humans hold roughly 4±1
 * chunks; retention shifts within that envelope.
 */
export function workingMemoryCapacity(persona) {
    return Math.round(3 + persona.traits.memoryRetention * 3); // 3..6
}
/** Frustration level (0..1) at which the operator abandons the task. */
export function abandonmentThreshold(persona) {
    return 0.55 + persona.traits.patience * 0.4; // 0.55..0.95
}
//# sourceMappingURL=persona.js.map