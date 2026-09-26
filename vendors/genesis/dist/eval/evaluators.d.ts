/**
 * Evaluators as first-class objects.
 *
 * - deterministic: exact match, regex, JSON-schema, inline JS predicate.
 * - reference: compare output against task.reference/expected.
 * - llm_command: run an external judge command (model-agnostic; captures judge
 *   model, prompt digest, raw output — the judge stays evaluable, never truth).
 * - human: import judgments from JSONL ({task_id, score|passed}).
 * - oracle: arbitrary external validator command → exit-zero means pass.
 * - composite: combine sub-evaluators (all/any) + score averaging.
 * - pass_through: trust subject output booleans (for self-eval harnesses).
 * - classification: compare a predicted label against task reference/labels.
 *   Records details {predicted, actual, predicted_bool, actual_bool, score?}
 *   so precision/recall/F1/ROC-AUC/PR-AUC/calibration aggregate honestly.
 *   Binary rates need a declared `positive` class (or boolean actuals).
 * - retrieval: compare retrieved ids against task relevant_ids. Records
 *   details {retrieved_ids, relevant_ids} for retrieval precision/recall/F1.
 */
import { type Runner } from "../evidence/runner.js";
import type { EvalTask, EvaluatorKind, Observation } from "./types.js";
import type { EvaluatorSpec } from "./spec.js";
export interface Evaluator {
    readonly name: string;
    readonly kind: EvaluatorKind;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
    describe(): Record<string, unknown>;
}
export declare function createEvaluator(spec: EvaluatorSpec, runner?: Runner): Evaluator;
/** Exact match against reference/expected (or fixed field value). */
export declare class ExactEvaluator implements Evaluator {
    #private;
    readonly name = "exact";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec);
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/** Regex over stringified output; `invert` passes when the pattern is ABSENT (e.g. injected markers). */
export declare class RegexEvaluator implements Evaluator {
    #private;
    readonly name = "regex";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec);
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/** Minimal JSON-schema check (type/properties/required/enum) — no dependency. */
export declare class JsonSchemaEvaluator implements Evaluator {
    #private;
    readonly name = "json_schema";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec);
    describe(): Record<string, unknown>;
    evaluate(_task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/** Inline JS predicate: script receives (output, task) and returns boolean/number/{score,passed}. */
export declare class JavaScriptEvaluator implements Evaluator {
    #private;
    readonly name = "javascript";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec);
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/** External command judge: task+output files → JSON {score|passed} on stdout. */
export declare class CommandEvaluator implements Evaluator {
    #private;
    readonly name: string;
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec, runner: Runner);
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/**
 * LLM judge via external command. Captures judge model, prompt digest, raw
 * output. The score stays an observation — Genesis can audit this evaluator
 * with `genesis audit` or adversarial trials. Never ground truth.
 */
export declare class LlmCommandEvaluator implements Evaluator {
    #private;
    readonly name = "llm";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec, runner: Runner);
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/** Human judgments imported from JSONL: {task_id, score} or {task_id, passed}. */
export declare class HumanEvaluator implements Evaluator {
    #private;
    readonly name = "human";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec);
    describe(): Record<string, unknown>;
    /**
     * Inter-rater agreement (Cohen's κ) between primary and secondary
     * judgments over overlapping tasks, or null when no second rater exists.
     * Precomputed once — no per-call file I/O.
     */
    agreement(): {
        cohen_kappa: number | null;
        n: number;
        interpretation: string | null;
    } | null;
    evaluate(task: EvalTask, _output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/** Combine sub-evaluators: all must pass (all) or any (any); scores averaged. */
export declare class CompositeEvaluator implements Evaluator {
    #private;
    readonly name = "composite";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec, runner: Runner);
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/** Trust boolean-ish subject output directly (self-eval harnesses). */
export declare class PassThroughEvaluator implements Evaluator {
    readonly name = "pass_through";
    readonly kind: EvaluatorKind;
    describe(): Record<string, unknown>;
    evaluate(_task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/**
 * Classification: predicted label vs ground truth.
 *
 * Actual comes from task.reference ?? task.expected ?? task.labels.actual.
 * Predicted is the raw output, or output.label/predicted/class for objects.
 * A numeric `scoreField` is recorded when present for ROC-AUC / PR-AUC /
 * calibration. Binary booleans resolve against the declared `positive` class
 * (default true when the actual is boolean); multiclass tasks without a
 * declared positive class record raw labels only, and binary-only metrics
 * honestly return null for them.
 */
export declare class ClassificationEvaluator implements Evaluator {
    #private;
    readonly name = "classification";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec);
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/**
 * Retrieval: retrieved ids vs relevant ids.
 *
 * Relevant ids come from task.labels.relevant_ids ?? task.metadata.relevant_ids
 * ?? task.context.relevant_ids. Retrieved ids come from an array output or
 * output.retrieved_ids/retrieved/ids. Scoring uses set semantics from
 * metrics.retrievalTrialStats: duplicates de-duplicated, malformed or empty
 * retrieval scores 0, missing gold abstains.
 */
export declare class RetrievalEvaluator implements Evaluator {
    readonly name = "retrieval";
    readonly kind: EvaluatorKind;
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
export declare function idList(v: unknown): string[] | null;
/**
 * Legacy helper kept for API compatibility; delegates to the canonical
 * set-semantics implementation in metrics.ts.
 */
export declare function retrievalPR(retrieved: readonly string[] | null, relevant: readonly string[] | null): {
    p: number | null;
    r: number | null;
};
/**
 * Trajectory / scope adherence: judges an agent's action sequence, not just
 * its final answer. The OAI-HF lesson — a swarm that attacks unasked targets
 * and probes the grader — is a scope violation, and scope is checkable:
 * which tools ran, which targets were touched, which patterns appear, how
 * many steps ran. Rules come from the spec with per-task `constraints`
 * overriding per key.
 *
 * Output shape: `{steps: [{tool, target?, ...}]}` or a bare array of steps.
 * Unparseable trajectories abstain (a missing trace is not evidence).
 */
export declare class TrajectoryEvaluator implements Evaluator {
    #private;
    readonly name = "trajectory";
    readonly kind: EvaluatorKind;
    constructor(spec: EvaluatorSpec);
    describe(): Record<string, unknown>;
    evaluate(task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
/**
 * Refusal: did the subject refuse a disallowed request? Passes when the
 * output opens with (or contains, within the first 1500 chars) a refusal
 * signal. Deliberately narrow: this checks refusal behavior, not safety in
 * general — pair it with forbidden-capability gates for the full checkpoint.
 */
export declare class RefusalEvaluator implements Evaluator {
    readonly name = "refusal";
    readonly kind: EvaluatorKind;
    describe(): Record<string, unknown>;
    evaluate(_task: EvalTask, output: unknown): Promise<Omit<Observation, "trial_id" | "task_id">>;
}
//# sourceMappingURL=evaluators.d.ts.map