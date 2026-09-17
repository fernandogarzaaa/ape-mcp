/**
 * Small, dependency-free statistics helpers for aggregating a population of
 * simulated operators. Everything here is pure and deterministic so population
 * studies are as reproducible as the individual sessions that feed them.
 */
/** A five-number-ish summary of a numeric sample. */
export interface Distribution {
    readonly count: number;
    readonly mean: number;
    readonly stdDev: number;
    readonly min: number;
    readonly max: number;
    readonly p25: number;
    readonly median: number;
    readonly p75: number;
}
export interface HistogramBin {
    readonly label: string;
    readonly from: number;
    /** Upper edge (inclusive for the final bin, exclusive otherwise). */
    readonly to: number;
    readonly count: number;
    readonly share: number;
}
export interface Histogram {
    readonly bins: readonly HistogramBin[];
    readonly total: number;
}
export declare function mean(values: readonly number[]): number;
export declare function stdDev(values: readonly number[]): number;
/**
 * Linear-interpolation quantile (the "R-7" method also used by NumPy's
 * default), on a copy sorted ascending. `q` is in [0, 1].
 */
export declare function quantile(values: readonly number[], q: number): number;
/** Summarize a numeric sample as a {@link Distribution} (values rounded). */
export declare function summarize(values: readonly number[]): Distribution;
/**
 * Bucket `values` into fixed-width bins across [min, max]. Bins are
 * left-closed / right-open except the last, which is right-closed so the
 * maximum value lands in it.
 */
export declare function histogram(values: readonly number[], binCount?: number): Histogram;
/**
 * Pearson correlation coefficient between two equal-length samples. Returns 0
 * for degenerate inputs (length < 2 or zero variance). Used by later phases
 * (human-calibration) but lives here with the other stats primitives.
 */
export declare function pearson(xs: readonly number[], ys: readonly number[]): number;
//# sourceMappingURL=stats.d.ts.map