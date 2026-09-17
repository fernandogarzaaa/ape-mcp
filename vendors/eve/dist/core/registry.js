/**
 * Registries for vocabularies that used to be closed unions.
 *
 * `ScoreDimension`, `FindingCategory` and (CP/1's) `ExperienceAction` were
 * hand-written union types: adding a value meant editing core files and every
 * `Record<Union, …>` consumer. They are now backed by registries — the
 * shipped values are pre-registered as built-ins (so existing consumers see
 * no change), and domain packs and plugins can register new entries at
 * runtime without touching core.
 *
 * The registry pattern follows the existing scenario registry
 * (`src/fitness/scenarios.ts`): a module-level instance with `register` /
 * `list` / `require` functions, and failure on unknown ids rather than
 * silent skipping.
 *
 * Two invariants survive registry-ization unchanged:
 *
 * - **Evidence is mandatory.** Every score deduction and finding still cites
 *   the events that caused it. Registry entries carry
 *   `evidenceRequired: true` as a type-level literal so a new domain cannot
 *   register a vibes-based dimension.
 * - **The CP/1 wire is untouched.** Registered values serialize as strings,
 *   exactly like the built-ins did, so document bytes and content hashes are
 *   unchanged. New action verbs in particular are engine-side only
 *   ({@link ActionVerbEntry.onCp1Wire}); widening the canonical CP/1 verb set
 *   is a protocol change (SPEC §8), not a registration.
 */
/** Every modality current surfaces can declare; the default `appliesTo`. */
export const ALL_MODALITIES = [
    "visual",
    "textual",
    "document",
    "conversational",
];
/**
 * A named, string-keyed registry with fail-loud semantics: duplicates and
 * unknown lookups are errors, never silent no-ops.
 */
export class EveRegistry {
    kind;
    entries = new Map();
    constructor(kind) {
        this.kind = kind;
    }
    /**
     * Add an entry. Re-registering an id is rejected — replacing a built-in
     * would change the meaning of stored reports that already reference it.
     */
    register(entry) {
        if (this.entries.has(entry.id)) {
            throw new Error(`${this.kind} "${entry.id}" is already registered`);
        }
        this.entries.set(entry.id, entry);
    }
    get(id) {
        return this.entries.get(id);
    }
    has(id) {
        return this.entries.has(id);
    }
    /** Resolve an id, failing loudly on unknown ones (like `resolveScenarios`). */
    require(id) {
        const entry = this.entries.get(id);
        if (!entry) {
            throw new Error(`unknown ${this.kind} "${id}"; registered ids are ${[...this.entries.keys()].join(", ")}`);
        }
        return entry;
    }
    list() {
        return [...this.entries.values()];
    }
    /** Entries meaningful on the given modality (`appliesTo` gating). */
    listFor(modality) {
        return this.list().filter((entry) => {
            const appliesTo = entry.appliesTo;
            return appliesTo === undefined || appliesTo.includes(modality);
        });
    }
}
//# sourceMappingURL=registry.js.map