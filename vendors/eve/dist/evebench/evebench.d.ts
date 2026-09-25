/**
 * EVE Bench — a formal benchmark platform. Where `validateBenchmarks` checks a
 * single construct-validity property (excellent > average > bad on the overall
 * score), EVE Bench runs a defined suite of reference apps through the full
 * cognitive simulation and publishes a multi-dimensional scorecard: task
 * success, overall experience, frustration, trust, cognitive load, expectation
 * alignment, and learnability.
 */
import { type BenchmarkTier } from "../benchmarks/index.js";
import { type MockAppSpec } from "../browser/index.js";
export interface BenchmarkCase {
    readonly id: string;
    readonly tier: BenchmarkTier;
    readonly app: MockAppSpec;
    readonly goal: string;
    readonly successSignal: string;
}
/** The default EVE Bench suite: the three known-quality reference apps. */
export declare const EVEBENCH_CASES: readonly BenchmarkCase[];
export interface CaseScore {
    readonly id: string;
    readonly tier: BenchmarkTier;
    readonly taskSuccess: number;
    readonly overallScore: number;
    readonly frustration: number;
    readonly trust: number;
    readonly cognitiveLoad: number;
    readonly expectationAlignment: number;
    readonly learnability: number;
    /** Composite EVE Bench score, 0..100. */
    readonly composite: number;
}
export interface EveBenchReport {
    readonly cases: readonly CaseScore[];
    /** Mean composite across cases. */
    readonly overall: number;
    /** True when composites rank excellent > average > bad (internal discrimination regression). */
    readonly ordered: boolean;
    readonly summary: string;
    readonly generatedAt: string;
}
export interface EveBenchOptions {
    readonly cases?: readonly BenchmarkCase[];
    readonly panel?: readonly string[];
    readonly seed?: number | string;
    readonly maxSteps?: number;
}
/** Run the EVE Bench suite and publish a multi-dimensional scorecard. */
export declare function runEveBench(options?: EveBenchOptions): Promise<EveBenchReport>;
//# sourceMappingURL=evebench.d.ts.map