/**
 * Statistics: estimates with method, assumptions, and uncertainty.
 *
 * No automatic "significance" claims. Every result exposes n, method,
 * assumptions, and intervals. Small-n intervals are wide — saying so is the
 * deliverable (same discipline as backtest/metrics.ts Wilson reporting).
 */
import { wilson } from "../backtest/metrics.js";
import type { PairedComparison, StatisticalResult } from "./types.js";
export { wilson };
export declare function describe(values: readonly number[], metric: string): StatisticalResult | null;
/** Binary-rate summary with Wilson interval (reuses backtest module). */
export declare function describeRate(successes: number, total: number, metric: string): StatisticalResult | null;
/** Deterministic PRNG (mulberry32) so bootstrap CIs are reproducible by seed. */
export declare function mulberry32(seed: number): () => number;
export declare function bootstrapMeanCI(values: readonly number[], resamples?: number, level?: number, seed?: number): {
    low: number;
    high: number;
};
/**
 * Paired comparison (same task population in both arms). Reports delta,
 * relative delta, Cohen's d on paired differences, and bootstrap CI of the
 * mean paired difference. Never declares significance.
 */
export declare function pairedCompare(baseline: ReadonlyMap<string, number> | Record<string, number>, treatment: ReadonlyMap<string, number> | Record<string, number>, metric: string): PairedComparison | null;
/** Parse a threshold expression like ">=0.90" → {op, value}. */
export declare function parseThreshold(expr: string): {
    op: string;
    value: number;
} | null;
export declare function checkThreshold(value: number | null, expr: string): boolean | null;
//# sourceMappingURL=stats.d.ts.map