/**
 * Deterministic pseudo-random number generation.
 *
 * Human behavior is variable but a simulation must be reproducible: given the
 * same seed, persona and application state, EVE takes the same path. All
 * stochastic behavior (click slips, hesitation, wandering attention) draws
 * from a session-scoped {@link Rng} rather than Math.random.
 */
export interface Rng {
    /** Uniform float in [0, 1). */
    next(): number;
    /** Uniform float in [min, max). */
    range(min: number, max: number): number;
    /** Uniform integer in [min, max] inclusive. */
    int(min: number, max: number): number;
    /** True with probability p. */
    chance(p: number): boolean;
    /** Approximately normal sample (mean, stdDev) via central limit sum. */
    gaussian(mean: number, stdDev: number): number;
    /** Pick a uniformly random element; throws on empty array. */
    pick<T>(items: readonly T[]): T;
    /** Weighted pick; weights need not sum to 1. Throws on empty input. */
    weightedPick<T>(items: readonly T[], weights: readonly number[]): T;
}
/** mulberry32 — small, fast, good-enough statistical quality for simulation. */
export declare function createRng(seed: number): Rng;
/** Derive a numeric seed from an arbitrary string (FNV-1a). */
export declare function seedFromString(input: string): number;
/** Clamp helper used across the emotional/cognitive models. */
export declare function clamp01(v: number): number;
export declare function clamp(v: number, min: number, max: number): number;
//# sourceMappingURL=random.d.ts.map