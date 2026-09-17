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
    constructor(path: string);
    private read;
    load(id: string): Promise<TwinProfile | null>;
    save(twin: TwinProfile): Promise<void>;
    list(): Promise<TwinProfile[]>;
}
//# sourceMappingURL=store.d.ts.map