/**
 * Persistence for digital twins — a JSON-file store keyed by twin id, so a
 * twin survives and keeps evolving across processes and sessions.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isFileNotFoundError } from "../core/fsErrors.js";
// A function, not a shared constant: `{ ...empty() }` would still copy only
// the top level, leaving every caller's `.twins` pointing at the same nested
// object. A fresh literal per call is the only way an "empty store" from one
// read doesn't become every read's shared, mutable state.
function empty() {
    return { version: 1, twins: {} };
}
/** In-memory twin store (for tests). */
export class InMemoryTwinStore {
    twins = new Map();
    async load(id) {
        return this.twins.get(id) ?? null;
    }
    async save(twin) {
        this.twins.set(twin.id, twin);
    }
    async list() {
        return [...this.twins.values()];
    }
}
/** JSON-file-backed twin store for real cross-session persistence. */
export class FileTwinStore {
    path;
    /**
     * Write queues shared by RESOLVED PATH (CodeRabbit PR #39): a per-instance
     * queue cannot serialize two `FileTwinStore` instances over the same file,
     * which then read the same body and overwrite each other (lost updates) or
     * collide on one `${pid}.tmp` name (rename races). Path-keyed queues plus
     * unique tmp names close both gaps within this process. Cross-process
     * writers remain last-writer-wins (documented — use a DB for that).
     */
    static queues = new Map();
    static tmpCounter = 0;
    constructor(path) {
        this.path = path;
    }
    queueKey() {
        return resolve(this.path);
    }
    async read() {
        let text;
        try {
            text = await readFile(this.path, "utf8");
        }
        catch (error) {
            if (isFileNotFoundError(error))
                return empty();
            throw new Error(`could not read twin store at ${this.path}: ${String(error)}`);
        }
        try {
            const parsed = JSON.parse(text);
            if (parsed.version !== 1 ||
                parsed.twins === null ||
                typeof parsed.twins !== "object" ||
                Array.isArray(parsed.twins)) {
                return empty();
            }
            return parsed;
        }
        catch (error) {
            throw new Error(`could not read twin store at ${this.path}: ${String(error)}`);
        }
    }
    async load(id) {
        return (await this.read()).twins[id] ?? null;
    }
    async save(twin) {
        // Same guarantees as FileMemoryStore (P0.7): mutex-serialized
        // read-modify-write plus atomic tmp+rename persistence.
        const key = this.queueKey();
        const prev = FileTwinStore.queues.get(key) ?? Promise.resolve();
        const task = prev.then(async () => {
            const body = await this.read();
            body.twins[twin.id] = twin;
            await mkdir(dirname(this.path), { recursive: true });
            const tmp = `${this.path}.${process.pid}.${FileTwinStore.tmpCounter++}.tmp`;
            await writeFile(tmp, JSON.stringify(body, null, 2), "utf8");
            await rename(tmp, this.path);
        });
        FileTwinStore.queues.set(key, task.then(() => undefined, () => undefined));
        await task;
    }
    async list() {
        return Object.values((await this.read()).twins);
    }
}
//# sourceMappingURL=store.js.map