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
/**
 * Normalize a task id for matching: trim, lowercase, collapse separators.
 * `Checkout_Basic-01` and `checkout basic 01` are the same task.
 */
export function normalizeTaskId(taskId) {
    return taskId
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "_");
}
/** True when two task ids name the same task after normalization. */
export function matchTaskIds(a, b) {
    if (!a.trim() || !b.trim())
        return false;
    return normalizeTaskId(a) === normalizeTaskId(b);
}
/**
 * Resolve the effective task id for a run: explicit option wins, then the
 * spec's id, else null (explicit absence — never a fabricated id).
 */
export function resolveTaskId(explicitTaskId, spec) {
    const raw = explicitTaskId?.trim() ? explicitTaskId : spec?.taskId;
    return raw?.trim() ? raw.trim() : null;
}
/* NON-GOALS (deliberately absent — would be elaboration, not testability):
 * - step-by-step procedures or subtask graphs (the operator discovers these)
 * - preconditions beyond starting conditions (unverifiable without oracles)
 * - causal completion oracles (text signals remain an honest proxy)
 * - demographic claims about who performs the task (see population policy)
 */
//# sourceMappingURL=task.js.map