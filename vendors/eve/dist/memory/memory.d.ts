import type { Rng } from "../core/random.js";
import type { Action, Percept } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
/**
 * The operator's memory, split — as human memory is — into subsystems:
 *
 * - Working memory: the handful of things currently "in mind". Small,
 *   volatile, persona-capacity-limited.
 * - Episodic memory: what happened — screens visited, actions taken and how
 *   they turned out. Subject to forgetting.
 * - Semantic memory: generalized knowledge extracted from episodes ("the
 *   gear icon opens settings here", "Ctrl+S saves"). Discovered features and
 *   learned shortcuts live here.
 * - Spatial memory: a map of the product — which screens exist and which
 *   actions connect them.
 */
export interface WorkingMemoryItem {
    readonly content: string;
    readonly step: number;
}
export interface Episode {
    readonly step: number;
    readonly url: string;
    readonly screenSignature: string;
    readonly action: string;
    readonly outcome: "success" | "surprise" | "error" | "nothing" | "pending";
    /** Strength decays over time; 0 means forgotten. */
    strength: number;
}
export interface LearnedFact {
    readonly kind: "shortcut" | "location" | "convention" | "warning" | "feature";
    readonly statement: string;
    confidence: number;
    reinforcements: number;
}
export interface ScreenNode {
    readonly signature: string;
    url: string;
    title: string;
    visits: number;
    firstSeenStep: number;
    lastSeenStep: number;
    /** Element labels observed as interactive on this screen. */
    affordances: Set<string>;
    /** Labels already tried on this screen. */
    triedAffordances: Set<string>;
}
export interface ScreenEdge {
    readonly from: string;
    readonly to: string;
    readonly via: string;
    traversals: number;
}
/**
 * A perceptual signature for "which screen am I on". Humans recognize
 * screens by their gist — URL path, title and dominant headings — not by
 * exact pixel identity.
 */
export declare function screenSignature(percept: Percept): string;
export declare class OperatorMemory {
    private readonly persona;
    private readonly rng;
    private readonly working;
    private readonly episodes;
    private readonly facts;
    private readonly screens;
    private readonly edges;
    private readonly navigationTrail;
    private readonly capacity;
    constructor(persona: Persona, rng: Rng);
    hold(content: string, step: number): void;
    /** Distraction or overload can knock an item out of working memory. */
    maybeForgetWorkingItem(): string | null;
    currentThoughts(): readonly WorkingMemoryItem[];
    recordEpisode(step: number, percept: Percept, action: Action | null, actionDescription: string, outcome: Episode["outcome"]): void;
    /** Ebbinghaus-style decay each step; retention slows forgetting. */
    decayEpisodes(): void;
    /** Episodes still recallable (strength above a noise floor). */
    recallEpisodes(filter?: (ep: Episode) => boolean): readonly Episode[];
    errorCount(): number;
    /** Has an action with this description failed before on this screen? */
    remembersFailure(signature: string, actionDescription: string): boolean;
    learn(fact: Omit<LearnedFact, "confidence" | "reinforcements">, confidence?: number): void;
    knownFacts(kind?: LearnedFact["kind"]): readonly LearnedFact[];
    observeScreen(percept: Percept, step: number): ScreenNode;
    markTried(signature: string, affordanceLabel: string): void;
    recordTransition(from: string, to: string, via: string): void;
    knownScreens(): readonly ScreenNode[];
    knownEdges(): readonly ScreenEdge[];
    isNovelScreen(percept: Percept): boolean;
    /**
     * Pre-seed screens the operator remembers from previous sessions, so a
     * returning user *recognizes* them (skips re-reading) and carries forward
     * which affordances they knew about. Called once at session start when a
     * long-term memory profile is loaded; a no-op for first-ever sessions.
     */
    seedFamiliarScreens(remembered: ReadonlyArray<{
        signature: string;
        url: string;
        title: string;
        affordances: Iterable<string>;
    }>): void;
    trail(): readonly string[];
    /** Detects going in circles: visiting the same screen repeatedly recently. */
    loopingScore(): number;
}
//# sourceMappingURL=memory.d.ts.map