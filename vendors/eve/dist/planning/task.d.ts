/**
 * Task specification: a stable experimental identity independent of any run.
 *
 * A goal description ("reset my password") is operator intent; a task is the
 * experiment. A human trace and an EVE trace that both say
 * `taskId = "checkout_basic_01"` are comparable without embedding task
 * semantics in URLs, step counts, or prose. The identity exists for
 * calibration, held-out evaluation, cross-run comparison, cross-site
 * mapping, and experiment manifests — not to re-describe the goal.
 *
 * Deliberately small: identity + starting conditions + bounds + family.
 * No steps, subtasks, preconditions, or checklists (see NON-GOALS below).
 */
/** A task family/domain grouping related taskIds (e.g. "checkout"). */
export type TaskFamily = string;
export interface TaskStartingConditions {
    /** URL the operator starts from, when fixed by the experiment. */
    readonly startUrl?: string;
    /** Persona the task was designed for, when fixed (else null = any). */
    readonly persona?: string;
}
export interface TaskBounds {
    /** Maximum steps allowed, when the experiment bounds it. */
    readonly maxSteps?: number;
    /** Maximum duration in ms, when the experiment bounds it. */
    readonly maxDurationMs?: number;
}
export interface TaskSpec {
    /** Stable cross-run identity, e.g. "checkout_basic_01". */
    readonly taskId: string;
    /** Human-readable description of what the operator must accomplish. */
    readonly description: string;
    /** Goal text handed to the operator (defaults to description). */
    readonly goal?: string;
    /**
     * Text signals whose appearance marks completion (same proxy semantics
     * as session `goalSuccessSignals` — a proxy, not causal proof).
     */
    readonly successSignals?: readonly string[];
    readonly startingConditions?: TaskStartingConditions;
    readonly bounds?: TaskBounds;
    readonly family?: TaskFamily;
    readonly metadata?: Readonly<Record<string, string>>;
}
/**
 * Normalize a task id for matching: trim, lowercase, collapse separators.
 * `Checkout_Basic-01` and `checkout basic 01` are the same task.
 */
export declare function normalizeTaskId(taskId: string): string;
/** True when two task ids name the same task after normalization. */
export declare function matchTaskIds(a: string, b: string): boolean;
/**
 * Resolve the effective task id for a run: explicit option wins, then the
 * spec's id, else null (explicit absence — never a fabricated id).
 */
export declare function resolveTaskId(explicitTaskId: string | undefined, spec: TaskSpec | undefined): string | null;
//# sourceMappingURL=task.d.ts.map