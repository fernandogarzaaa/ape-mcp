/**
 * Population simulation — run many varied operators against the same app and
 * aggregate their experiences statistically. Where a single {@link EveSession}
 * answers "how did this one person do?", a population study answers "how does
 * the distribution of modeled operators do?": success/drop-off rates, confidence and
 * frustration distributions, a task-completion histogram, a navigation
 * heatmap, and the expected user segments.
 *
 * It composes existing sessions without changing them: each operator is an
 * ordinary seeded {@link EveSession}, so a study is as reproducible as its
 * seed. Fully offline against the `mock:` app.
 */
import { type AdapterName, type BrowserAdapter } from "../browser/index.js";
import { type EmotionVector } from "../emotion/emotionalState.js";
import { type PopulationDistribution } from "./distribution.js";
import { type Segment } from "./segments.js";
import { type Distribution, type Histogram } from "./stats.js";
/** One operator sampled into the population. */
export interface OperatorSpec {
    readonly index: number;
    readonly persona: string;
    readonly profession?: string;
    readonly culture?: string;
    readonly seed: string;
}
/** The realized outcome of one operator's session. */
export interface OperatorRun {
    readonly index: number;
    readonly persona: string;
    readonly profession: string | null;
    readonly culture: string;
    readonly seed: string;
    readonly overall: number;
    readonly completed: boolean;
    readonly goalAchieved: boolean;
    readonly abandoned: boolean;
    readonly abandonReason: string | null;
    readonly endReason: string;
    readonly steps: number;
    readonly durationMinutes: number;
    readonly screensVisited: number;
    readonly findings: number;
    readonly criticalFindings: number;
    readonly emotions: EmotionVector;
    readonly segment: string;
    readonly path: readonly string[];
    readonly dropoffScreen: string | null;
}
export interface HeatmapEntry {
    readonly screen: string;
    /** Total visits summed across all operators. */
    readonly visits: number;
    /** How many distinct operators visited this screen. */
    readonly operators: number;
    /** Fraction of the population that visited (0..1). */
    readonly reach: number;
    /** How many operators abandoned on this screen. */
    readonly dropoffs: number;
}
export interface AggregatedFinding {
    readonly title: string;
    readonly severity: string;
    readonly category: string;
    readonly operatorsAffected: number;
    /** Fraction of the population that hit this finding (0..1). */
    readonly prevalence: number;
    readonly evidence: string | null;
    readonly recommendation: string | null;
}
export interface PopulationStudy {
    readonly url: string;
    /** Human-facing target name for reports. Useful when an `adapterFactory`
     * supplies an app that isn't the literal `url`. Optional — consumers fall
     * back to `url`, so pre-existing constructors are unaffected.
     * `simulatePopulation` always populates it. */
    readonly label?: string;
    readonly size: number;
    readonly goal: string | null;
    readonly successRate: number;
    readonly dropoffRate: number;
    readonly endReasonBreakdown: Readonly<Record<string, number>>;
    readonly overallScore: Distribution;
    readonly confidence: Distribution;
    readonly frustration: Distribution;
    readonly trust: Distribution;
    readonly stepsToComplete: Distribution;
    readonly completionHistogram: Histogram;
    readonly navigationHeatmap: readonly HeatmapEntry[];
    readonly segments: readonly Segment[];
    readonly topFindings: readonly AggregatedFinding[];
    readonly operators: readonly OperatorRun[];
    readonly generatedAt: string;
}
export interface PopulationOptions {
    /** Target URL, or `mock:`/`mock:<screen>` for the offline demo app. */
    readonly url: string;
    /** Human-facing name for reports (defaults to `url`). Set this when an
     * `adapterFactory` drives an app that isn't the literal `url`. */
    readonly label?: string;
    /** Number of operators to simulate (default 25). */
    readonly size?: number;
    /** Persona names to sample from (default: the whole built-in library). */
    readonly personas?: readonly string[];
    /**
     * Weighted population distribution (Phase 10). When present, the roster
     * is drawn by deterministic weighted sampling instead of the default
     * round-robin BalancedPanel. Weights are scenario parameters — they do
     * NOT represent real demographics without human evidence.
     */
    readonly distribution?: PopulationDistribution;
    /** Professional overlays to mix across the population (round-robin). */
    readonly professions?: readonly string[];
    /** Cultural profiles to mix across the population (round-robin). */
    readonly cultures?: readonly string[];
    readonly goal?: string;
    readonly goalSuccessSignals?: readonly string[];
    /** Base seed; each operator derives a distinct seed from it (default 1). */
    readonly seed?: number | string;
    readonly maxSteps?: number;
    readonly maxDurationMs?: number;
    readonly cognitive?: boolean;
    /** Use utility-based decisions for the whole population. */
    readonly utility?: boolean;
    readonly screenshots?: boolean;
    /** Browser backend when no `adapterFactory` is given (default inferred). */
    readonly browser?: AdapterName;
    /**
     * Custom per-operator adapter factory (required for real browsers so each
     * operator gets an isolated session). Defaults to `createAdapter`.
     */
    readonly adapterFactory?: (spec: OperatorSpec) => BrowserAdapter;
    /** Max operators to run concurrently (default 4). */
    readonly concurrency?: number;
    readonly onProgress?: (done: number, total: number) => void;
}
/** Build the deterministic roster of operators to simulate. */
export declare function sampleOperators(options: PopulationOptions): OperatorSpec[];
/**
 * Simulate a population of operators and aggregate the results into a
 * {@link PopulationStudy}. Deterministic for a fixed `seed`, `size`, and pool.
 */
export declare function simulatePopulation(options: PopulationOptions): Promise<PopulationStudy>;
//# sourceMappingURL=population.d.ts.map