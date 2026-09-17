import type { Persona } from "./persona.js";
/**
 * Social personas: professional overlays.
 *
 * A profession is not a full persona — it is an overlay that layers domain
 * vocabulary, workflow priorities, expectations and habits onto a base
 * persona. This models how a doctor and an accountant, even with similar
 * baseline traits, bring different mental models and terminology to the same
 * software (domain expertise shapes perception; Chi, Feltovich & Glaser
 * 1981 on expert schemas).
 */
export interface Profession {
    readonly name: string;
    readonly description: string;
    /** Domain terms this professional recognizes and expects (boosts goal relevance / lowers load). */
    readonly vocabulary: readonly string[];
    /** Workflow kinds this professional prioritizes. */
    readonly workflowPriorities: readonly string[];
    /** Trait deltas applied to the base persona (added, then clamped). */
    readonly traitDeltas: Partial<Record<keyof Persona["traits"], number>>;
    /** Habit notes surfaced in reports (for realism/explanation). */
    readonly habits: readonly string[];
}
export declare const PROFESSIONS: Record<string, Profession>;
export declare function listProfessions(): readonly Profession[];
export declare function getProfession(name: string): Profession;
/** Apply a profession overlay to a base persona, returning a new persona. */
export declare function applyProfession(base: Persona, profession: Profession): Persona;
//# sourceMappingURL=professions.d.ts.map