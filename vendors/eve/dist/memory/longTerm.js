import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isFileNotFoundError } from "../core/fsErrors.js";
// A function, not a shared constant: `{ ...emptyStore() }` would still copy
// only the top level, leaving every caller's `.applications` pointing at the
// same nested object. A fresh literal per call is the only way an "empty
// store" from one read doesn't become every read's shared, mutable state.
function emptyStore() {
    return { version: 2, applications: {} };
}
/** Derive a stable application id from a URL (origin, or full mock id). */
export function appIdForUrl(url) {
    try {
        const u = new URL(url);
        return u.origin;
    }
    catch {
        return url.split("/").slice(0, 3).join("/") || url;
    }
}
/** Namespace key: operator-private by default, never implicitly shared. */
export function memoryKeyFor(appId, operatorId = "shared") {
    return `${operatorId}::${appId}`;
}
export class InMemoryStore {
    store = { version: 2, applications: {} };
    async load(appId, operatorId = "shared") {
        const namespaced = this.store.applications[memoryKeyFor(appId, operatorId)];
        if (namespaced)
            return namespaced;
        // Same legacy fallback as FileMemoryStore (pre-namespace bare-appId keys).
        if (operatorId === "shared") {
            const legacy = this.store.applications[appId];
            if (legacy) {
                this.store.applications[memoryKeyFor(appId, operatorId)] = legacy;
                return legacy;
            }
        }
        return null;
    }
    async save(memory, operatorId = "shared") {
        this.store.applications[memoryKeyFor(memory.appId, operatorId)] = memory;
    }
    snapshot() {
        return structuredClone(this.store);
    }
}
export class FileMemoryStore {
    path;
    /**
     * Write queues shared by RESOLVED PATH (CodeRabbit PR #39): a per-instance
     * queue cannot serialize two stores over the same file, which then read
     * the same document and overwrite each other (lost updates) or collide on
     * one `${pid}.tmp` name. Path-keyed queues plus unique tmp names close
     * both gaps within this process. Cross-process writers remain
     * last-writer-wins (documented limitation).
     */
    static queues = new Map();
    static tmpCounter = 0;
    constructor(path) {
        this.path = path;
    }
    async read() {
        let text;
        try {
            text = await readFile(this.path, "utf8");
        }
        catch (error) {
            if (isFileNotFoundError(error))
                return emptyStore();
            throw new Error(`could not read memory store at ${this.path}: ${String(error)}`);
        }
        try {
            const parsed = JSON.parse(text);
            if (parsed.version !== 2 ||
                parsed.applications === null ||
                typeof parsed.applications !== "object" ||
                Array.isArray(parsed.applications)) {
                return emptyStore();
            }
            return parsed;
        }
        catch (error) {
            throw new Error(`could not read memory store at ${this.path}: ${String(error)}`);
        }
    }
    async load(appId, operatorId = "shared") {
        const store = await this.read();
        const namespaced = store.applications[memoryKeyFor(appId, operatorId)];
        if (namespaced)
            return namespaced;
        // Legacy migration (CodeRabbit PR #39): pre-namespace v2 stores keyed
        // profiles by bare `appId`. An upgraded install would otherwise report
        // memory missing. Fall back to the legacy key once, then self-heal by
        // persisting the entry under its namespaced key.
        if (operatorId === "shared") {
            const legacy = store.applications[appId];
            if (legacy) {
                await this.save(legacy, operatorId);
                return legacy;
            }
        }
        return null;
    }
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
    async save(memory, operatorId = "shared") {
        const key = resolve(this.path);
        const prev = FileMemoryStore.queues.get(key) ?? Promise.resolve();
        const task = prev.then(async () => {
            const store = await this.read();
            store.applications[memoryKeyFor(memory.appId, operatorId)] = memory;
            await mkdir(dirname(this.path), { recursive: true });
            const tmp = `${this.path}.${process.pid}.${FileMemoryStore.tmpCounter++}.tmp`;
            await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
            await rename(tmp, this.path);
        });
        FileMemoryStore.queues.set(key, task.then(() => undefined, () => undefined));
        await task;
    }
}
/** Create a blank application memory. */
export function emptyApplicationMemory(appId, appName) {
    return {
        appId,
        appName,
        sessionsCount: 0,
        screens: {},
        transitions: {},
        facts: {},
        favoriteWorkflows: [],
        frustrationSpots: [],
        knownShortcuts: [],
        history: [],
    };
}
/**
 * Apply between-session forgetting to a loaded memory. `sessionsElapsed` is
 * how many of the operator's sessions (anywhere) have passed since a trace
 * was last reinforced; retention 0..1 slows decay.
 *
 * Uses R = e^(−λ·Δ) with λ shrinking as retention grows — the Ebbinghaus
 * forgetting curve with rehearsal (Anderson & Schooler's rational-analysis
 * base-level activation is the same exponential family).
 */
export function applyForgetting(memory, currentSession, retention) {
    const lambda = 0.5 * (1 - retention * 0.8); // higher retention → flatter curve
    const decay = (lastSession) => {
        const delta = Math.max(0, currentSession - lastSession);
        return Math.exp(-lambda * delta);
    };
    for (const screen of Object.values(memory.screens)) {
        const factor = decay(screen.lastSeenSession);
        for (const label of Object.keys(screen.affordances)) {
            const strength = (screen.affordances[label] ?? 0) * factor;
            if (strength < 0.08)
                delete screen.affordances[label];
            else
                screen.affordances[label] = strength;
        }
    }
    for (const key of Object.keys(memory.facts)) {
        const fact = memory.facts[key];
        fact.confidence *= decay(fact.lastSeenSession);
        if (fact.confidence < 0.1)
            delete memory.facts[key];
    }
}
/** Total recallable knowledge, for the Retention metric. */
export function retainedKnowledge(memory) {
    let sum = 0;
    for (const screen of Object.values(memory.screens)) {
        for (const strength of Object.values(screen.affordances))
            sum += strength;
    }
    for (const fact of Object.values(memory.facts))
        sum += fact.confidence;
    return sum;
}
//# sourceMappingURL=longTerm.js.map