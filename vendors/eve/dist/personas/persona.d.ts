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
export interface PersonaTraits {
    /** Words per minute of comfortable reading (absolute, not 0..1). */
    readingSpeedWpm: number;
    /** Motor precision: 1 = pixel-perfect clicks, 0 = frequent slips. */
    clickAccuracy: number;
    /**
     * Typing accuracy: 1 = near error-free (a 2% slip floor remains — even
     * expert typists fat-finger keys), 0 = frequent typos (P1.2).
     * Independent from pointer precision — poor mouse aim does not imply
     * poor keyboard skill. Defaults to `clickAccuracy` when unspecified so
     * existing persona specs keep working.
     */
    typingAccuracy: number;
    /** Overall movement/typing tempo: 1 = very fast, 0 = very slow. */
    motorSpeed: number;
    /** How well screens/labels are retained across steps. */
    memoryRetention: number;
    /** Willingness to click destructive-looking or unfamiliar controls. */
    riskTolerance: number;
    /** Tolerance for friction before frustration snowballs. */
    patience: number;
    /** Ability to stay on the current subgoal without wandering. */
    attentionSpan: number;
    /** Drive to explore unvisited areas of the product. */
    curiosity: number;
    /** Baseline self-confidence when facing an unfamiliar screen. */
    baseConfidence: number;
    /** Willingness to try actions with unknown outcomes. */
    experimentation: number;
    /** Preference for keyboard (shortcuts, tab) over mouse. */
    keyboardPreference: number;
    /** Prior exposure to software conventions ("a gear icon means settings"). */
    techLiteracy: number;
    /** How quickly experience updates the mental model. */
    learningRate: number;
    /** Probability per step of a momentary distraction/idle pause. */
    distractibility: number;
    /** Ability to recover composure after an error. */
    resilience: number;
    /** Tendency to read everything vs skim. */
    thoroughness: number;
}
export interface AccessibilityProfile {
    /** Simulated color vision deficiency, affects contrast findings weighting. */
    colorVision: "typical" | "protanopia" | "deuteranopia" | "tritanopia";
    /** Minimum comfortable font size in px; smaller text raises effort. */
    minComfortableFontPx: number;
    /** Operator relies primarily on the keyboard (no mouse). */
    keyboardOnly: boolean;
    /** Multiplier on all motor action durations (tremor, limited dexterity). */
    motorDifficultyFactor: number;
}
export interface Persona {
    readonly name: string;
    readonly description: string;
    readonly traits: PersonaTraits;
    readonly accessibility: AccessibilityProfile;
    /** Initial emotional disposition overrides (0..1 per emotion). */
    readonly disposition: Partial<Record<string, number>>;
}
export declare const DEFAULT_ACCESSIBILITY: AccessibilityProfile;
/** Average adult reading speed baseline. */
export declare const BASELINE_TRAITS: PersonaTraits;
export interface PersonaSpec {
    name: string;
    description?: string;
    traits?: Partial<PersonaTraits>;
    accessibility?: Partial<AccessibilityProfile>;
    disposition?: Partial<Record<string, number>>;
}
/** Build a complete persona from a partial spec, validating trait ranges. */
export declare function definePersona(spec: PersonaSpec): Persona;
/** Time to read `wordCount` words, in ms. Thoroughness gates skimming. */
export declare function readingTimeMs(persona: Persona, wordCount: number): number;
/** Base pointer travel + settle time for one motor action, in ms. */
export declare function motorActionMs(persona: Persona): number;
/** Per-character typing interval in ms. */
export declare function typingIntervalMs(persona: Persona): number;
/**
 * Standard deviation, in px, of click landing position around the intended
 * target center. Small targets plus low accuracy produce misclicks.
 */
export declare function clickScatterPx(persona: Persona): number;
/**
 * How many recent items fit in working memory. Humans hold roughly 4±1
 * chunks; retention shifts within that envelope.
 */
export declare function workingMemoryCapacity(persona: Persona): number;
/** Frustration level (0..1) at which the operator abandons the task. */
export declare function abandonmentThreshold(persona: Persona): number;
//# sourceMappingURL=persona.d.ts.map