/**
 * Subject adapters: run an arbitrary system under test without an SDK.
 *
 * - command: `python agent.py {input}` / `{task_file}` — task JSON via temp file,
 *   input string interpolated; stdout is the output (JSON parsed when possible).
 * - http: POST the task to an endpoint, read the response body.
 * - inline: deterministic local transforms (echo/upper/lower/reverse/identity)
 *   for reproducible examples and self-evaluation.
 *
 * Every execution is bounded, redacted, and returns a Trial-shaped result.
 */
import { type Runner } from "../evidence/runner.js";
import type { EvalTask } from "./types.js";
import type { SubjectSpec } from "./spec.js";
export interface SubjectResult {
    readonly output: unknown;
    readonly raw_stdout: string;
    readonly raw_stderr: string;
    readonly exit_code: number | null;
    readonly duration_ms: number;
    readonly timed_out: boolean;
    readonly error: string | null;
}
export interface SubjectAdapter {
    readonly name: string;
    run(task: EvalTask, repetition: number, seed: number | string | null): Promise<SubjectResult>;
    describe(): Record<string, unknown>;
}
export declare function createSubject(spec: SubjectSpec, runner?: Runner): SubjectAdapter;
/** Deterministic local subject. The backbone of reproducible examples. */
export declare class InlineSubject implements SubjectAdapter {
    #private;
    readonly name: string;
    constructor(name: string, kind: string);
    describe(): Record<string, unknown>;
    run(task: EvalTask, repetition: number, seed: number | string | null): Promise<SubjectResult>;
}
/** Arbitrary command. Zero integration cost: point at any executable. */
export declare class CommandSubject implements SubjectAdapter {
    #private;
    readonly name: string;
    constructor(name: string, spec: SubjectSpec, runner: Runner);
    describe(): Record<string, unknown>;
    run(task: EvalTask): Promise<SubjectResult>;
}
/** HTTP subject: POST {task} and read the body. */
export declare class HttpSubject implements SubjectAdapter {
    #private;
    readonly name: string;
    constructor(name: string, spec: SubjectSpec);
    describe(): Record<string, unknown>;
    run(task: EvalTask): Promise<SubjectResult>;
}
/** Split a command string respecting single/double quotes. */
export declare function splitCommand(command: string): string[];
//# sourceMappingURL=subjects.d.ts.map