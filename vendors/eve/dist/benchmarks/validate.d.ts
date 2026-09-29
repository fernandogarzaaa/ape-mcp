import { type BenchmarkTier } from "./apps.js";
/**
 * Benchmark validation harness.
 *
 * Runs EVE against the three known-quality apps with a fixed persona panel
 * and checks that the resulting scores are ordered excellent > average > bad.
 * This is EVE's construct-DISCRIMINATION REGRESSION benchmark (P1.9-audit):
 * it proves the instrument still discriminates the reference fixtures it was
 * designed against — it is NOT external human validation and must never be
 * reported as "construct validity" or proof of human realism. Human
 * calibration requires real human ground truth (see docs/human-calibration.md).
 */
export interface BenchmarkRunResult {
    tier: BenchmarkTier;
    meanScore: number;
    perPersona: Array<{
        persona: string;
        score: number;
        completed: boolean;
        abandoned: boolean;
    }>;
}
export interface BenchmarkValidation {
    results: BenchmarkRunResult[];
    ordered: boolean;
    /** Score separation between adjacent tiers (excellent−average, average−bad). */
    separations: {
        excellentVsAverage: number;
        averageVsBad: number;
    };
    summary: string;
}
export interface BenchmarkOptions {
    personas?: readonly string[];
    seed?: number;
    maxSteps?: number;
    goal?: string;
    cognitive?: boolean;
}
/** Run all three tiers and validate the ordering. */
export declare function validateBenchmarks(options?: BenchmarkOptions): Promise<BenchmarkValidation>;
//# sourceMappingURL=validate.d.ts.map