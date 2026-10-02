import type { OperatorSpec } from "./population.js";
/**
 * Population distribution sampling (Phase 10 calibration substrate).
 *
 * Two sampling semantics, explicitly distinguished:
 *
 * - `BalancedPanel` (default, unchanged): deterministic round-robin over
 *   the persona/profession/culture pools. Guarantees balanced coverage —
 *   every persona appears equally often. This is NOT a population model.
 * - `PopulationDistribution`: weighted, seeded sampling from explicit
 *   segment weights. Deterministic given (distribution, size, seed):
 *   cumulative-weight draws from a dedicated `createRng` stream derived
 *   from the base seed (never a live session RNG), so the same spec
 *   always yields the same roster.
 *
 * Weights are OPERATOR-specified scenario parameters, never demographic
 * claims: nothing here asserts these weights represent real user
 * populations until human evidence says so. Unnormalized weights are
 * normalized (with an explicit error on all-zero/negative).
 */
export interface PopulationSegment {
    readonly persona?: string;
    readonly profession?: string;
    readonly culture?: string;
    /** Relative weight; normalized across segments. Must be >= 0. */
    readonly weight: number;
}
export interface PopulationDistribution {
    readonly segments: readonly PopulationSegment[];
}
/**
 * Deterministic weighted roster. Draw `size` operators by cumulative-weight
 * sampling; personas/professions/cultures default per draw (segment value,
 * else the caller's fallback pools round-robin, else library default).
 * Seeds derive as `${base}#weighted-${i}` so weighted rosters never collide
 * with round-robin `#i` seeds. Non-finite or sub-1 sizes throw — a NaN size
 * must never silently yield zero operators.
 */
export declare function sampleDistribution(distribution: PopulationDistribution, size: number, seed: number | string, fallbackPersonas?: readonly string[], fallbackProfessions?: readonly string[], fallbackCultures?: readonly string[]): OperatorSpec[];
//# sourceMappingURL=distribution.d.ts.map