/**
 * Inter-rater agreement for human (and human-vs-machine) judgments.
 *
 * Cohen's κ (two raters, categorical labels) and Fleiss' κ (N raters)
 * discount raw percent-agreement by chance agreement from the marginals —
 * the same honesty discipline as Wilson intervals elsewhere in Genesis.
 * κ is descriptive, never a verdict: report it alongside N and let the
 * reader judge whether the judges agree enough to carry the claim.
 */
export interface KappaResult {
    readonly kappa: number | null;
    readonly n: number;
    readonly interpretation: string | null;
}
/** Landis–Koch bands, descriptive labels only. */
export declare function interpretKappa(kappa: number | null): string | null;
/**
 * Cohen's κ over paired categorical labels. Null when there are no pairs
 * or chance agreement is 1 (e.g. both raters constant on one label —
 * agreement is then undefined, not perfect).
 */
export declare function cohenKappa(a: readonly unknown[], b: readonly unknown[]): KappaResult;
/**
 * Fleiss' κ for N raters: `table[i][j]` = raters assigning item i to
 * category j. Every row must sum to the same rater count; otherwise null
 * (ragged rating coverage is a data problem, not a computable κ).
 */
export declare function fleissKappa(table: readonly (readonly number[])[]): KappaResult;
//# sourceMappingURL=agreement.d.ts.map