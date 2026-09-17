import type { MockAppSpec } from "../browser/mock.js";
/**
 * Benchmark applications of known UX quality.
 *
 * A measurement instrument must discriminate known cases — this is construct
 * validity. These three apps implement the *same* core task (sign up and
 * reach a dashboard) at three deliberately different quality levels. EVE
 * should score them in a strict order (excellent > average > bad); the
 * benchmark harness (`validateBenchmarks`) turns that requirement into an
 * automated check.
 */
/** EXCELLENT: clear labels, short path, feedback, escape hatches, plain copy. */
export declare const EXCELLENT_APP: MockAppSpec;
/** AVERAGE: workable but with mild friction — vaguer labels, an extra step. */
export declare const AVERAGE_APP: MockAppSpec;
/**
 * BAD: hostile UX — vague CTAs, a dead-end, an error on the main path, tiny
 * low-contrast text, jargon, no back links, a long detour to succeed.
 */
export declare const BAD_APP: MockAppSpec;
export declare const BENCHMARK_APPS: {
    readonly excellent: MockAppSpec;
    readonly average: MockAppSpec;
    readonly bad: MockAppSpec;
};
export type BenchmarkTier = keyof typeof BENCHMARK_APPS;
//# sourceMappingURL=apps.d.ts.map