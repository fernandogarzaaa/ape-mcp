import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
export class InMemoryStore {
    store = { version: 2, applications: {} };
    async load(appId) {
        return this.store.applications[appId] ?? null;
    }
    async save(memory) {
        this.store.applications[memory.appId] = memory;
    }
    snapshot() {
        return structuredClone(this.store);
    }
}
export class FileMemoryStore {
    path;
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
    async load(appId) {
        const store = await this.read();
        return store.applications[appId] ?? null;
    }
    async save(memory) {
        const store = await this.read();
        store.applications[memory.appId] = memory;
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(this.path, JSON.stringify(store, null, 2), "utf8");
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