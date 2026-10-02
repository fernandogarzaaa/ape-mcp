/**
 * Persistence for digital twins — a JSON-file store keyed by twin id, so a
 * twin survives and keeps evolving across processes and sessions.
 */
import type { TwinProfile } from "./types.js";
export interface TwinStore {
    load(id: string): Promise<TwinProfile | null>;
    save(twin: TwinProfile): Promise<void>;
    list(): Promise<TwinProfile[]>;
}
/** In-memory twin store (for tests). */
export declare class InMemoryTwinStore implements TwinStore {
    private readonly twins;
    load(id: string): Promise<TwinProfile | null>;
    save(twin: TwinProfile): Promise<void>;
    list(): Promise<TwinProfile[]>;
}
/** JSON-file-backed twin store for real cross-session persistence. */
export declare class FileTwinStore implements TwinStore {
    private readonly path;
    /**
     * Write queues shared by RESOLVED PATH (CodeRabbit PR #39): a per-instance
     * queue cannot serialize two `FileTwinStore` instances over the same file,
     * which then read the same body and overwrite each other (lost updates) or
     * collide on one `${pid}.tmp` name (rename races). Path-keyed queues plus
     * unique tmp names close both gaps within this process. Cross-process
     * writers remain last-writer-wins (documented — use a DB for that).
     */
    private static readonly queues;
    private static tmpCounter;
    constructor(path: string);
    private queueKey;
    private read;
    load(id: string): Promise<TwinProfile | null>;
    save(twin: TwinProfile): Promise<void>;
    list(): Promise<TwinProfile[]>;
}
//# sourceMappingURL=store.d.ts.map