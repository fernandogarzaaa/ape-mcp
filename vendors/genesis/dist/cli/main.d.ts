/**
 * Genesis CLI.
 *
 * Exit codes are distinct on purpose: a CI integration must be able to block on
 * EXPLOITABLE without parsing stdout, and Genesis failing (3) must never be
 * confusable with a verifier failing.
 */
export declare function main(argv: readonly string[]): Promise<number>;
//# sourceMappingURL=main.d.ts.map