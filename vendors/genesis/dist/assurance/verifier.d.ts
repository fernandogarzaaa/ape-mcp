/**
 * The verifier under test.
 *
 * Genesis invokes an arbitrary verifier as a subprocess: it writes the task and
 * the candidate completion to files, substitutes their paths into a declared
 * command template, and reads back a verdict. This is deliberately the dumbest
 * integration that could work — verifiers in the wild are Python scripts, shell
 * pipelines, and Makefile targets, and requiring them to implement an interface
 * would mean auditing only the verifiers that already care about being audited.
 *
 * Note the inversion relative to the acceptance layer: there, Genesis ran a
 * repository's checks to judge a change. Here the check *is* the subject, and
 * the completions are instruments. Same runner, opposite direction.
 */
import type { Runner } from "../evidence/runner.js";
import type { Probe } from "./probe.js";
/** How to read accept/reject out of what the verifier emitted. */
export type AcceptRule = 
/** Exit status zero means accept. */
{
    readonly kind: "exit_zero";
}
/** Parse stdout as JSON and threshold a numeric reward field. */
 | {
    readonly kind: "json_reward";
    readonly field?: string;
    readonly threshold?: number;
}
/** Parse stdout as JSON and read a boolean field. */
 | {
    readonly kind: "json_pass";
    readonly field?: string;
};
export interface VerifierConfig {
    readonly name: string;
    /**
     * Command template. `{task_file}` and `{completion_file}` are replaced with
     * paths to JSON and raw-text files respectively.
     */
    readonly command: readonly string[];
    readonly accept: AcceptRule;
    /**
     * Wall-clock bound on the verifier itself. A verifier that exceeds it has
     * failed to return a verdict, which for an exploit probe is a finding rather
     * than an infrastructure problem — see `missing_timeouts`.
     */
    readonly timeout_ms: number;
    readonly cwd?: string;
}
export type Observed = "accept" | "reject" | "unresponsive" | "error";
export interface VerifierResponse {
    readonly observed: Observed;
    readonly exit_code: number | null;
    readonly raw_reward: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly duration_ms: number;
    readonly note: string | null;
}
/**
 * A Judge fires probes at some oracle and reports what it decided. Two
 * implementations exist: `VerifierAdapter` here, for RLVR-style verifiers
 * judging an agent-submitted completion, and `EveOracleAdapter` for EVE's
 * behavioral oracle, whose "completion" is a candidate success-signal
 * configuration rather than a file an agent produced. `runAudit`,
 * `concludeAudit`, and the report renderer are written against this
 * interface and do not know or care which kind of oracle is under test.
 */
export interface Judge {
    readonly name: string;
    judge(probe: Probe): Promise<VerifierResponse>;
    /** Recorded verbatim with the ledger entry — command, accept rule, whatever identifies exactly what was invoked. */
    describe(): Record<string, unknown>;
}
export declare class VerifierAdapter implements Judge {
    #private;
    constructor(config: VerifierConfig, runner: Runner);
    get name(): string;
    get config(): VerifierConfig;
    describe(): Record<string, unknown>;
    judge(probe: Probe): Promise<VerifierResponse>;
}
/** Verifiers routinely print progress around their JSON verdict. */
export declare function parseJsonLoose(text: string): Record<string, unknown> | null;
//# sourceMappingURL=verifier.d.ts.map