import { type BrowserAdapter } from "../browser/adapter.js";
import type { DecisionPolicy } from "../cognition/cognition.js";
import { EventBus } from "../core/events.js";
import type { Finding, LoopIteration, Percept, Score, SessionUsage, Viewport } from "../core/types.js";
import { type EmotionSample } from "../emotion/emotionalState.js";
import { type LearningMetrics } from "../memory/learning.js";
import { type ApplicationMemory, type PersistentMemory } from "../memory/longTerm.js";
import { type QueryStatePolicy } from "../memory/surfaceIdentity.js";
import { type CultureProfile } from "../personas/culture.js";
import type { Persona, PersonaTraits } from "../personas/persona.js";
import { type EvePlugin } from "../plugins/plugin.js";
import type { DiscoveredWorkflow, WorkflowNode, WorkflowTransition } from "../workflow/graph.js";
import { type DiscoveredJourney } from "../workflow/journeys.js";
import { type CognitiveConfig, type CognitiveLoadTimeline, type ExpectationScore, type Fixation, type TrustSample } from "./cognitiveSuite.js";
/**
 * EveSession — one simulated human, one application, one sitting.
 *
 * Runs the human loop:
 *   Observe → Interpret → Update Mental Model → Predict → Decide → Interact
 *   → Observe Again → Compare Prediction vs Reality → Adjust Internal State
 *   → Continue
 *
 * The loop never follows a script: every step is decided fresh by the
 * cognition policy from the operator's current perception and internal state.
 */
export interface SessionOptions {
    adapter: BrowserAdapter;
    startUrl: string;
    /** Persona object or the name of a built-in persona. */
    persona?: Persona | string;
    policy?: DecisionPolicy;
    plugins?: readonly EvePlugin[];
    /** Task description; omit for open-ended exploration. */
    goal?: string;
    /** Signals whose appearance means the goal succeeded. */
    goalSuccessSignals?: readonly string[];
    seed?: number | string;
    maxSteps?: number;
    maxDurationMs?: number;
    viewport?: Viewport;
    /** Capture screenshots each step (needs a pixel-capable adapter). */
    screenshots?: boolean;
    /**
     * Multiplier applied to simulated human pauses when pacing the real
     * browser. 1 = real-time human speed; 0 = as fast as possible. The
     * simulated clock always advances at full human speed regardless.
     */
    paceScale?: number;
    /**
     * Model time instead of reading it.
     *
     * Off by default, because driving a real browser means waiting for real
     * latency. Turn it on when the surface under test is deterministic (a
     * `MockAdapter`, say) and the run has to be replayable: perceived latency,
     * the settle wait and the time budget then come from the simulated human
     * clock, so nothing about how busy the host machine was can reach the
     * operator's appraisal — and through it the session's score.
     */
    deterministic?: boolean;
    /** Log sink for progress lines. */
    onLog?: (line: string) => void;
    /**
     * Enable the enhanced cognitive suite: selective attention, cognitive-load
     * estimation, the trust model, and the expectation engine. `true` enables
     * all; pass an object to enable subsets. Off by default.
     */
    cognitive?: boolean | CognitiveConfig;
    /**
     * Persistent cross-session memory. When provided, the operator remembers
     * this application between sessions (layouts, paths, past frustrations) and
     * becomes more efficient over repeated runs.
     */
    longTermMemory?: PersistentMemory;
    /**
     * Explicit operator identity for persistent memory (CodeRabbit PR #39).
     * `persona.name` is a template ("office-worker"), not an operator: two
     * different humans on the same persona must not share episodic history,
     * frustration spots, shortcuts, or confidence. Pass a per-operator id
     * (user id, twin id, run label); omitted → legacy `persona.name`
     * namespacing (unchanged behavior for existing callers).
     */
    operatorId?: string;
    /** Cultural profile (locale string or object) shaping reading direction etc. */
    culture?: CultureProfile | string;
    /**
     * Optional navigation allowlist (domains + their subdomains) — operational
     * safety (P1.12). When set, the start URL and every cognition-chosen `navigate`
     * action outside it are blocked. Empty/omitted = unrestricted (default,
     * backwards compatible). Container isolation, time/resource quotas and
     * download control remain deployment concerns — see docs/security.md.
     */
    allowedHosts?: readonly string[];
    /**
     * Query-state classification policy (reviewer decision 2): which URL query
     * keys are semantic UI state vs high-cardinality data. Defaults to
     * `DEFAULT_QUERY_STATE_POLICY`; override to teach EVE app-specific state
     * keys. Threaded into sensitive-state keys and workflow attribution.
     */
    queryStatePolicy?: QueryStatePolicy;
}
export interface SessionResult {
    readonly startUrl: string;
    readonly personaName: string;
    /** Generating parameters for calibration records (reviewer requirement). */
    readonly personaTraits?: PersonaTraits;
    readonly policyName?: string;
    readonly surfaceAdapter?: string;
    readonly surfaceAdapterVersion?: string | null;
    readonly seed: number;
    readonly iterations: readonly LoopIteration[];
    readonly findings: readonly Finding[];
    readonly scores: readonly Score[];
    readonly emotionTimeline: readonly EmotionSample[];
    readonly workflows: readonly DiscoveredWorkflow[];
    readonly workflowNodes: readonly WorkflowNode[];
    readonly workflowTransitions: readonly WorkflowTransition[];
    readonly screenshots: readonly Buffer[];
    readonly usage: SessionUsage;
    readonly goalAchieved: boolean;
    readonly abandoned: boolean;
    readonly abandonReason: string | null;
    readonly endReason: string;
    readonly appTheory: string;
    /**
     * Set when the run loop threw and was caught rather than completing
     * normally (`endReason` is then `"crashed"`) — a network drop, a browser
     * crash, an unguarded plugin. The adapter is still closed and every
     * finding/score/iteration gathered before the throw is still returned;
     * this is the caller's only signal that the result is partial rather than
     * a complete, successfully-finished session.
     */
    readonly error: string | null;
    /**
     * Advisories about the configured `goalSuccessSignals` — cases where a
     * signal was satisfied by text that does not evidence task completion.
     *
     * Goal success is decided by substring presence in visible screen text,
     * which is a proxy for task state rather than a measurement of it. These
     * warnings surface the cases where the proxy is most likely to mislead, so
     * a mis-chosen signal fails loudly instead of silently reporting success.
     * Empty when no signals are configured or none looked suspicious.
     */
    readonly goalSignalWarnings: readonly string[];
    /**
     * Advisories recorded whenever an LLM-backed policy or plugin degraded to
     * its non-LLM fallback (missing/invalid API key, network error, refusal,
     * malformed response) — so a degraded run is visible here and on the
     * `llm:fallback` event, rather than silently indistinguishable from a
     * fully LLM-backed one. De-duplicated the same way as
     * `goalSignalWarnings`: a policy/plugin failing the same way every step
     * reads as one advisory. Empty when no LLM policy/plugin was configured,
     * or none degraded.
     */
    readonly llmFallbackWarnings: readonly string[];
    /** One representative percept per unique screen (screenshot buffers removed). */
    readonly capturedScreens: readonly Percept[];
    readonly culture: string;
    readonly trustTimeline?: readonly TrustSample[];
    readonly cognitiveLoad?: CognitiveLoadTimeline;
    readonly attention?: {
        fixations: Array<{
            step: number;
            fixations: readonly Fixation[];
        }>;
        missedChanges: number;
    };
    readonly expectationTimeline?: readonly ExpectationScore[];
    /** The application's long-term memory *after* this session (if a store was used). */
    readonly longTermMemory?: ApplicationMemory;
    /** Cross-session learning metrics (if a store was used and history exists). */
    readonly learningMetrics?: LearningMetrics;
    /** The reconstructed user journey toward the goal. */
    readonly journey?: DiscoveredJourney;
}
export declare class EveSession {
    readonly events: EventBus;
    private readonly persona;
    private readonly policy;
    private readonly rng;
    private readonly seed;
    private readonly plugins;
    private readonly options;
    private findings;
    private findingCounter;
    private screenshotGallery;
    private lastShotBySignature;
    private geometryCheckedSignatures;
    /** Simulated human clock, ms. Advances by full human durations. */
    private simClock;
    /**
     * Where elapsed time comes from. The same object the {@link Observer} reads,
     * so the operator and its eyes never disagree about what time it is.
     */
    private readonly clock;
    private readonly culture;
    private readonly capturedScreens;
    constructor(options: SessionOptions);
    run(): Promise<SessionResult>;
    /** Store one screenshot-free representative percept per unique screen. */
    private captureScreen;
    private appNameFromUrl;
    /** Fold this session's experience into the persistent application memory. */
    private updateLongTermMemory;
    /**
     * The kernel view of a percept: the native kernel on kernel-capable
     * surfaces, the one-to-one projection of the legacy percept elsewhere.
     */
    private kernelOf;
    private execute;
    /** Advance the simulated clock by full human time; sleep a scaled slice. */
    /**
     * Charge time the operator spent waiting for the surface — as opposed to
     * {@link pace}, which charges time they chose to spend reading, deciding
     * or typing.
     *
     * Never sleeps. On a wall clock the wait has already happened in real
     * time inside the adapter and `clock.now()` has already moved, so
     * advancing again would count the same seconds twice; only the session's
     * own duration counter needs telling. On a simulated clock nothing
     * observed the wait at all, so the clock is advanced to match.
     */
    private endureSurfaceWait;
    private pace;
    /**
     * Geometry and pixel checks assume pixel geometry and visual styling are
     * meaningful. On a surface without them (`capabilities.spatial === false`)
     * they can only produce valid-but-trivial findings — character-cell boxes
     * flagged as tiny targets or clipped elements — so, exactly like the
     * plugins, the engine skips them rather than running and reporting them.
     * Skipped, not failed: a textual surface must never look like it failed a
     * visual audit.
     */
    private runVisionChecks;
    /**
     * Compare the rendering against the DOM's account of it.
     *
     * Kept apart from the checks above because it asks a different question.
     * Those measure properties of what the page reports — is this text large
     * enough, is this target big enough. This check asks whether what the page
     * reports is what a person actually sees, which is the only check here that
     * can find content no DOM-based tool can reach at all.
     *
     * Runs inside the same signature guard, so a screen revisited five times is
     * examined once.
     */
    private runRenderingChecks;
    private storeScreenshot;
    private learnFromOutcome;
    private reportOutcomeFindings;
    private addFinding;
    private makeIteration;
    private log;
}
//# sourceMappingURL=session.d.ts.map