import type { LearnedFact, ScreenEdge, ScreenNode } from "./memory.js";
/**
 * Long-term, cross-session memory.
 *
 * Humans remember applications between visits: layouts, where buttons live,
 * past mistakes, workflows that worked, and how they felt. This store
 * persists that knowledge keyed by application identity, and applies
 * between-session forgetting (Ebbinghaus decay, ACT-R rational analysis:
 * a trace's availability reflects how recently/often it was used).
 *
 * The store is a plain JSON document so it is portable, inspectable and
 * diffable; a session loads the relevant application profile at start and
 * writes an updated profile at end. This is what makes a second session
 * meaningfully differ from the first.
 */
export interface RememberedScreen {
    signature: string;
    url: string;
    title: string;
    /** Interactive labels observed here, with recall strength 0..1. */
    affordances: Record<string, number>;
    /** Times this screen has been visited across all sessions. */
    totalVisits: number;
    lastSeenSession: number;
}
export interface RememberedTransition {
    from: string;
    to: string;
    via: string;
    traversals: number;
}
export interface SessionMemoryRecord {
    session: number;
    timestamp: string;
    persona: string;
    goal: string;
    steps: number;
    durationMs: number;
    goalAchieved: boolean;
    abandoned: boolean;
    /** Mean confidence over the session. */
    confidence: number;
    /** Peak frustration over the session. */
    frustration: number;
    /** Peak/mean trust. */
    trust: number;
    /** Errors perceived. */
    errors: number;
    /** Expectation-violation rate 0..1. */
    surpriseRate: number;
    overallScore: number;
}
export interface ApplicationMemory {
    /** Stable identity of the application (usually the origin). */
    appId: string;
    appName: string;
    sessionsCount: number;
    screens: Record<string, RememberedScreen>;
    transitions: Record<string, RememberedTransition>;
    /** Semantic facts (shortcuts, conventions, warnings, feature locations). */
    facts: Record<string, LearnedFact & {
        lastSeenSession: number;
    }>;
    /** Workflows the operator completed, most-used first. */
    favoriteWorkflows: Array<{
        kind: string;
        completions: number;
        lastSession: number;
    }>;
    /** Screens that repeatedly frustrated the operator. */
    frustrationSpots: Array<{
        signature: string;
        title: string;
        occurrences: number;
    }>;
    /** Shortcuts discovered to work here. */
    knownShortcuts: string[];
    /** Per-session history for learning-curve analysis. */
    history: SessionMemoryRecord[];
}
export interface MemoryStore {
    version: 2;
    applications: Record<string, ApplicationMemory>;
}
/** Derive a stable application id from a URL (origin, or full mock id). */
export declare function appIdForUrl(url: string): string;
/**
 * A persistent memory store backed by a JSON file. Use {@link InMemoryStore}
 * for tests, or {@link FileMemoryStore} for real cross-session persistence.
 *
 * Operator isolation (P0.6): `operatorId` namespaces the profile so persona
 * A's episodic experience, frustration history, shortcuts and confidence
 * never leak into persona B. Pass the SAME operator id across sessions to
 * keep cross-session learning for one simulated operator; pass distinct ids
 * for distinct operators. The default ("shared") preserves the legacy
 * application-scoped behavior for callers that do not pass an id.
 *
 * Shared application facts (stable product structure) remain explicitly
 * shared: see {@link SharedApplicationKnowledge} below — nothing is shared
 * implicitly.
 */
export interface PersistentMemory {
    load(appId: string, operatorId?: string): Promise<ApplicationMemory | null>;
    save(memory: ApplicationMemory, operatorId?: string): Promise<void>;
}
/**
 * Facts explicitly designated as shared across operators (P0.6):
 * stable product structure and publicly observable static conventions.
 * Everything else (episodic experience, frustration, shortcuts, spatial
 * familiarity, confidence, mistakes, workflow preference) is operator-private
 * by default and lives in the namespaced {@link ApplicationMemory} profile.
 */
export interface SharedApplicationKnowledge {
    readonly appId: string;
    readonly structureFacts: readonly string[];
    readonly conventions: readonly string[];
}
/** Namespace key: operator-private by default, never implicitly shared. */
export declare function memoryKeyFor(appId: string, operatorId?: string): string;
export declare class InMemoryStore implements PersistentMemory {
    private store;
    load(appId: string, operatorId?: string): Promise<ApplicationMemory | null>;
    save(memory: ApplicationMemory, operatorId?: string): Promise<void>;
    snapshot(): MemoryStore;
}
export declare class FileMemoryStore implements PersistentMemory {
    private readonly path;
    /**
     * Write queues shared by RESOLVED PATH (CodeRabbit PR #39): a per-instance
     * queue cannot serialize two stores over the same file, which then read
     * the same document and overwrite each other (lost updates) or collide on
     * one `${pid}.tmp` name. Path-keyed queues plus unique tmp names close
     * both gaps within this process. Cross-process writers remain
     * last-writer-wins (documented limitation).
     */
    private static readonly queues;
    private static tmpCounter;
    constructor(path: string);
    private read;
    load(appId: string, operatorId?: string): Promise<ApplicationMemory | null>;
    /**
     * Concurrency-safe save (P0.7): writes are serialized through a
     * PATH-SHARED in-process mutex queue, merged against the latest on-disk
     * state (read-modify-write inside the queue, so concurrent saves cannot
     * silently overwrite each other), and persisted atomically via unique
     * tmp-file + rename so a crash cannot corrupt the store. Reads stay
     * deterministic (plain JSON parse).
     *
     * Guarantees: no lost updates between callers in this process (even
     * across store instances over the same path); atomic replacement on
     * POSIX/Windows rename; corrupt-file errors surface instead of silently
     * resetting. Cross-PROCESS concurrency is last-writer-wins at document
     * granularity (documented limitation — use SQLite/a DB for multi-process
     * population runs).
     */
    save(memory: ApplicationMemory, operatorId?: string): Promise<void>;
}
/** Create a blank application memory. */
export declare function emptyApplicationMemory(appId: string, appName: string): ApplicationMemory;
/**
 * Apply between-session forgetting to a loaded memory. `sessionsElapsed` is
 * how many of the operator's sessions (anywhere) have passed since a trace
 * was last reinforced; retention 0..1 slows decay.
 *
 * Uses R = e^(−λ·Δ) with λ shrinking as retention grows — the Ebbinghaus
 * forgetting curve with rehearsal (Anderson & Schooler's rational-analysis
 * base-level activation is the same exponential family).
 */
export declare function applyForgetting(memory: ApplicationMemory, currentSession: number, retention: number): void;
/** Total recallable knowledge, for the Retention metric. */
export declare function retainedKnowledge(memory: ApplicationMemory): number;
export type { LearnedFact, ScreenEdge, ScreenNode };
//# sourceMappingURL=longTerm.d.ts.map