/**
 * Projecting a CP/1 {@link Mutation} onto a simulated operator.
 *
 * ## What this module claims, and what it does not
 *
 * ADAM proposes changes to a genome: preferences, policies, goals, values,
 * capabilities, skills. EVE cannot measure a genome — it measures how an
 * operator fares against software. So a mutation is measurable here exactly
 * when it changes how the organism *operates*, and this module is the declared,
 * auditable mapping that says which mutations those are.
 *
 * When a mutation has no operational meaning — amending a goal, reconciling a
 * belief — this module returns `null` and the caller reports `needs_review`
 * with that reason. It does **not** invent a trait delta so that a number can
 * be produced. Fabricating a score for an unmeasurable change is precisely the
 * failure the CP/1 work exists to remove: the arrangement it replaced scored
 * every proposal by calling a closure the proposer supplied, and called the
 * result evidence.
 *
 * A mutation EVE declines to score is not thereby blocked. It is escalated:
 * ADAM's governance still decides, now knowing that simulation had nothing to
 * say rather than believing it had approved.
 *
 * ## Extending the mapping
 *
 * {@link TRAIT_PROJECTIONS} and {@link POLICY_KEYWORDS} are the extension
 * points. Both are data, both are exhaustively tested, and both are deliberate
 * about magnitude: a projection's effect size is fixed by the table, never
 * scaled by the mutation's own `confidence_bp`. Letting a proposal amplify its
 * own measured effect by asserting confidence in itself would reintroduce
 * self-reported evidence through the back door.
 */
import type { PersonaTraits } from "../personas/persona.js";
import type { Mutation } from "../protocol/types.js";
/** A change to one operator trait, in trait units. */
export interface TraitDelta {
    readonly trait: keyof PersonaTraits;
    /** Added to the baseline trait value, then clamped to the trait's range. */
    readonly amount: number;
}
export interface Projection {
    readonly deltas: readonly TraitDelta[];
    /** Human-readable account of why these deltas, for the FitnessResult reason. */
    readonly explanation: string;
}
/**
 * Genome preference keys with a defensible operational meaning, and the
 * operator trait each drives.
 *
 * Every entry answers "if the organism held this preference more strongly,
 * what would an observer see it do differently?". A preference that cannot
 * answer that question does not belong here.
 */
export declare const TRAIT_PROJECTIONS: Readonly<Record<string, readonly (keyof PersonaTraits)[]>>;
/**
 * Policy phrasings with an operational meaning, and their trait effect.
 *
 * Matched as substrings against a lowercased policy, longest first, so
 * "verify before acting" matches `verify` rather than needing an exact form.
 * Only the first match applies: a policy is one instruction, and summing
 * overlapping keyword hits would let verbose phrasing inflate an effect.
 */
export declare const POLICY_KEYWORDS: Readonly<Record<string, TraitDelta>>;
/**
 * Project a mutation onto operator trait deltas, or `null` when the mutation
 * has no measurable operational consequence.
 */
export declare function project(mutation: Mutation): Projection | null;
/** Why a mutation could not be projected, phrased for a FitnessResult reason. */
export declare function explainUnprojectable(mutation: Mutation): string;
/** Apply trait deltas, clamping each trait to its own valid range. */
export declare function applyDeltas(traits: PersonaTraits, deltas: readonly TraitDelta[]): PersonaTraits;
//# sourceMappingURL=projection.d.ts.map