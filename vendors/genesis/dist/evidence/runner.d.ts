/**
 * Subprocess execution for collectors.
 *
 * Genesis never authors, modifies, or repairs anything in the repository. It
 * does execute the repository's *own declared* verification commands, in order
 * to observe their results firsthand rather than take the executor's word for
 * them. That is the precise meaning of "Genesis does not execute": no write
 * path to the working tree, and no commands it invented.
 *
 * MVP posture: subprocess, scrubbed environment, wall-clock timeout. Adequate
 * for a locally-run CLI on the user's own code. Container isolation is a hard
 * prerequisite before this ever runs as a hosted service against arbitrary
 * verifiers.
 */
export interface RunResult {
    readonly command: readonly string[];
    readonly exit_code: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly started_at: string;
    readonly ended_at: string;
    readonly timed_out: boolean;
    readonly spawn_error: string | null;
    /** True when stdout/stderr hit the per-stream byte cap (distinct from timeout). */
    readonly output_limited?: boolean;
}
export interface RunOptions {
    readonly cwd: string;
    readonly timeoutMs?: number;
    readonly env?: Record<string, string>;
    /** Per-stream byte cap (default 1 MiB). Prevents memory exhaustion. */
    readonly maxBytes?: number;
}
export interface Runner {
    run(command: readonly string[], options: RunOptions): Promise<RunResult>;
}
export declare class SubprocessRunner implements Runner {
    #private;
    constructor(defaultTimeoutMs?: number);
    run(command: readonly string[], options: RunOptions): Promise<RunResult>;
}
/**
 * Digest of the execution environment — what "the same inputs" means when a
 * verdict is replayed. Runtime version, platform, and the dependency lockfile.
 */
export declare function computeEnvDigest(repoPath: string): string;
//# sourceMappingURL=runner.d.ts.map