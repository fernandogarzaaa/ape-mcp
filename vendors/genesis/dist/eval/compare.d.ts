/**
 * Comparison, regression gates, and ablation tables over evidence bundles.
 *
 * - compare: run-a vs run-b metric deltas from treatment/metrics.json.
 * - regression: gate a candidate bundle against thresholds (quality max drop,
 *   p95 latency / cost max increase). Exit-code friendly.
 * - ablation: per-arm metric table across treatment/baseline/ablations.
 */
export interface BundleMetrics {
    readonly verdict: {
        readonly verdict: string;
    };
    readonly metrics: readonly {
        metric: string;
        value: number;
        n: number;
    }[];
    readonly stats?: unknown;
}
export declare function loadBundleMetrics(dir: string): BundleMetrics;
export interface Delta {
    readonly metric: string;
    readonly a: number | null;
    readonly b: number | null;
    readonly delta: number | null;
    readonly relative: number | null;
}
export declare function compareBundles(aDir: string, bDir: string): {
    a: BundleMetrics;
    b: BundleMetrics;
    deltas: Delta[];
};
export declare function renderComparison(aDir: string, bDir: string): string;
export interface RegressionConfig {
    readonly quality?: {
        readonly max_drop?: number;
    };
    readonly p95_latency?: {
        readonly max_increase?: number;
    };
    readonly cost?: {
        readonly max_increase?: number;
    };
}
export interface RegressionResult {
    readonly pass: boolean;
    readonly checks: readonly {
        readonly name: string;
        readonly pass: boolean;
        readonly detail: string;
    }[];
}
export declare function checkRegression(baseDir: string, candDir: string, config: RegressionConfig): RegressionResult;
//# sourceMappingURL=compare.d.ts.map