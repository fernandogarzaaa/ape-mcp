import { type AttentionSnapshot, type Fixation } from "../cognition/attention.js";
import type { Decision } from "../cognition/cognition.js";
import { type CognitiveLoadBreakdown } from "../cognition/cognitiveLoad.js";
import { type ExpectationScore } from "../cognition/expectation.js";
import type { Rng } from "../core/random.js";
import type { Percept, PredictionOutcome } from "../core/types.js";
import type { EmotionalState } from "../emotion/emotionalState.js";
import { type TrustSample } from "../emotion/trust.js";
import type { ApplicationMemory } from "../memory/longTerm.js";
import type { Persona } from "../personas/persona.js";
/**
 * CognitiveSuite bundles the phase-2 per-step cognitive subsystems —
 * selective attention, cognitive-load estimation, the trust model, the
 * expectation engine, decision fatigue, and cross-session recall — behind a
 * small interface the session drives. It is instantiated only when the
 * enhanced cognitive mode is enabled, so phase-1 behavior is untouched when
 * it is absent.
 */
export interface CognitiveConfig {
    attention?: boolean;
    trust?: boolean;
    cognitiveLoad?: boolean;
    expectationEngine?: boolean;
}
export interface StepPerception {
    /** The percept restricted to what the operator actually attended to. */
    readonly perceptForDecision: Percept;
    readonly attention: AttentionSnapshot | null;
    readonly load: CognitiveLoadBreakdown | null;
}
export interface CognitiveLoadTimeline {
    meanIndex: number;
    peakIndex: number;
    samples: Array<{
        step: number;
        index: number;
        breakdown: CognitiveLoadBreakdown;
    }>;
}
export declare class CognitiveSuite {
    private readonly persona;
    private readonly rng;
    private readonly longTerm;
    private readonly config;
    private readonly trustModel;
    private readonly fatigue;
    private readonly streak;
    private readonly loadSamples;
    private readonly fixationLog;
    private readonly expectationLog;
    private missedChangeCount;
    private lastExpectationScore;
    constructor(persona: Persona, rng: Rng, longTerm: ApplicationMemory | null, config: CognitiveConfig | true);
    /** Recall function passed to the decision policy for cross-session bias. */
    recall(): ((label: string) => number) | undefined;
    /** Perceive one screen: allocate attention and estimate load. */
    perceive(percept: Percept, previousPercept: Percept | null, goalKeywords: readonly string[]): StepPerception;
    /** Extra fields to merge into the decision policy's cognitive context. */
    contextEnrichment(load: CognitiveLoadBreakdown | null): {
        trust?: number;
        cognitiveLoadIndex?: number;
        decisionFatigue?: number;
        recall?: (label: string) => number;
    };
    /**
     * After an action's outcome is known, update trust, expectation scoring
     * and feed the results back into emotion. Returns the expectation score (if
     * the expectation engine is on) for logging.
     */
    afterOutcome(decision: Decision, outcome: PredictionOutcome, before: Percept, after: Percept, emotion: EmotionalState, step: number): ExpectationScore | null;
    /** Consistency reinforcement when revisiting a remembered screen. */
    reinforceConsistency(sameAsRemembered: boolean): void;
    trustTimeline(): readonly TrustSample[];
    cognitiveLoadTimeline(): CognitiveLoadTimeline | null;
    attentionSummary(): {
        fixations: Array<{
            step: number;
            fixations: readonly Fixation[];
        }>;
        missedChanges: number;
    } | null;
    expectationTimeline(): readonly ExpectationScore[];
    lastScore(): ExpectationScore | null;
}
export type { CognitiveLoadBreakdown, ExpectationScore, Fixation, TrustSample };
//# sourceMappingURL=cognitiveSuite.d.ts.map