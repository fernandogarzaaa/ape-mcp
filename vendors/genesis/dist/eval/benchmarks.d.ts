/**
 * Benchmark registry: versioned, reusable evaluation workloads.
 *
 * A benchmark is a directory holding a `benchmark.yaml` (an EvalSpec without
 * a subject — the subject is supplied at run time, because the point of a
 * benchmark is to run *your* system against a *standard* workload) plus its
 * dataset and a README stating version history and known limits.
 *
 * Teams check in a baseline bundle and gate releases with
 * `genesis run-benchmark <name> --subject "<cmd>"` +
 * `genesis regression --base <baseline> --candidate <current>`
 * (see templates/ci/).
 */
import { type EvalSpec } from "./spec.js";
export interface BenchmarkInfo {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly task_count: number;
    readonly metrics: readonly string[];
    readonly dir: string;
}
export declare class BenchmarkError extends Error {
    readonly name = "BenchmarkError";
}
/** Locate the registry: explicit dir, ./benchmarks under cwd, or the shipped one. */
export declare function resolveRegistry(customDir?: string): string;
export declare function listBenchmarks(registryDir?: string): BenchmarkInfo[];
/** Load a benchmark spec, resolving relative dataset paths against its directory. */
export declare function loadBenchmark(name: string, registryDir?: string): {
    spec: EvalSpec;
    dir: string;
    version: string;
};
/** Resolve a benchmark's dataset path to an absolute path. */
export declare function resolveBenchmarkDataset(spec: EvalSpec, dir: string): EvalSpec;
//# sourceMappingURL=benchmarks.d.ts.map