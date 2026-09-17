/**
 * Declarative evaluation specification.
 *
 * Users write YAML/JSON; Genesis executes. Supports claim-first (claim file +
 * evaluation file) and standalone evaluation files. Never executes on load.
 */
import type { Claim } from "./types.js";
export interface EvalSpec {
    readonly name: string;
    readonly claim?: Claim;
    readonly claim_ref?: string;
    /**
     * Present on benchmark templates: reusable workloads that declare
     * everything except the subject (supplied at run time via --subject).
     * A spec without `subject` and without `benchmark` is invalid.
     */
    readonly benchmark?: {
        readonly version?: string;
        readonly description?: string;
    };
    readonly dataset: {
        readonly path?: string;
        readonly inline?: readonly unknown[];
        readonly stdin?: boolean;
        readonly format?: "json" | "jsonl" | "csv" | "yaml" | "text" | "dir" | "auto";
        readonly id?: string;
        readonly version?: string;
    };
    readonly subject?: SubjectSpec;
    readonly baseline?: SubjectSpec;
    readonly ablations?: readonly {
        readonly name: string;
        readonly subject: SubjectSpec;
    }[];
    readonly evaluator: EvaluatorSpec;
    readonly metrics?: readonly string[];
    readonly repetitions?: number;
    readonly seeds?: readonly (number | string)[];
    readonly paired?: boolean;
    readonly timeout_ms?: number;
    readonly thresholds?: Record<string, string>;
    readonly regression?: {
        readonly baseline_run?: string;
        readonly quality?: {
            readonly max_drop?: number;
        };
        readonly p95_latency?: {
            readonly max_increase?: number;
        };
        readonly cost?: {
            readonly max_increase?: number;
        };
    };
    /**
     * Release gate (capability checkpoint): metric ceilings that must NOT be
     * reached. `genesis gate` BLOCKS when any forbidden metric meets/exceeds
     * its ceiling, when evidence is missing, or when the evaluator is untrusted.
     */
    readonly gate?: {
        readonly forbidden?: Record<string, number>;
    };
    /**
     * Degenerate-policy sanity arms: adds `sanity:empty` and `sanity:random`
     * arms (doing nothing / gibberish must score ~0). A `reward-sanity`
     * finding fires when they exceed `sanity_threshold` (default 0.1) —
     * the generalizeable form of broken-RL-environment filtering.
     */
    readonly sanity_baseline?: boolean;
    readonly sanity_threshold?: number;
    /** External analysis files (e.g. interpretability notes) copied into the bundle. */
    readonly analysis?: readonly string[];
    readonly output?: {
        readonly dir?: string;
    };
}
export interface SubjectSpec {
    readonly name?: string;
    /** Command template with {input} and optionally {task_file}; reads task JSON on stdin-adjacent file. */
    readonly command?: string;
    readonly http?: {
        readonly url: string;
        readonly method?: string;
        readonly headers?: Record<string, string>;
    };
    /** Inline deterministic transform, e.g. "echo" | "upper" — for local reproducible examples. */
    readonly inline?: string;
    readonly env?: Record<string, string>;
    readonly timeout_ms?: number;
}
export interface EvaluatorSpec {
    readonly type: "exact" | "regex" | "json_schema" | "javascript" | "command" | "llm_command" | "human" | "oracle" | "composite" | "pass_through" | "classification" | "retrieval" | "trajectory" | "refusal";
    readonly field?: string;
    readonly pattern?: string;
    readonly schema?: Record<string, unknown>;
    readonly script?: string;
    readonly command?: string;
    readonly model?: string;
    readonly rubric?: string;
    readonly judgments?: string;
    readonly evaluators?: readonly EvaluatorSpec[];
    readonly mode?: "all" | "any";
    /** classification: the positive class (string/boolean/number). Required for binary precision/recall. */
    readonly positive?: unknown;
    /** classification: output object field holding a numeric score in [0,1] (for ROC-AUC, PR-AUC, calibration). */
    readonly scoreField?: string;
    /** trajectory: scope rules (per-task constraints override per key). */
    readonly rules?: TrajectoryRules;
}
export interface TrajectoryRules {
    readonly allowed_tools?: readonly string[];
    readonly forbidden_tools?: readonly string[];
    readonly forbidden_targets?: readonly string[];
    readonly forbidden_patterns?: readonly string[];
    readonly max_steps?: number;
}
export declare class SpecError extends Error {
    readonly name = "SpecError";
}
export declare function loadSpecFile(path: string): EvalSpec;
export declare function parseSpec(raw: string, sourceName?: string): EvalSpec;
export declare function validateSpec(raw: unknown, sourceName?: string): EvalSpec;
//# sourceMappingURL=spec.d.ts.map