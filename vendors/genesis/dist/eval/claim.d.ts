/**
 * Claim-first evaluation: parse, validate, and compile claims.
 *
 * A claim is what someone wants to establish empirically. It compiles to an
 * evaluation plan; it never executes anything itself. Invalid claims are
 * INVALID (a verdict about the claim), never silently coerced.
 */
import type { Claim, ClaimHypothesis } from "./types.js";
export declare class ClaimError extends Error {
    readonly name = "ClaimError";
}
export declare function validateClaim(raw: unknown): {
    claim: Claim;
    problems: string[];
};
/** Evaluate one hypothesis against an observed value. Null observed → null (INCONCLUSIVE). */
export declare function checkHypothesis(h: ClaimHypothesis, observed: number | null): boolean | null;
//# sourceMappingURL=claim.d.ts.map