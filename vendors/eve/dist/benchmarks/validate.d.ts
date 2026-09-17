import { type BenchmarkTier } from "./apps.js";
/**
 * Benchmark validation harness.
 *
 * Runs EVE against the three known-quality apps with a fixed persona panel
 * and checks that the resulting scores are ordered excellent > average > bad.
 * This is EVE's standing construct-validity test — if a change to the
 * cognitive model breaks the ordering, the instrument has lost discriminative
 * power and the harness fails.
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