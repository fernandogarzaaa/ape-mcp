import { canonicalMatchBasis } from "../memory/surfaceIdentity.js";
import { matchTaskIds } from "../planning/task.js";
function eveCanonical(e, taskId) {
    return {
        kind: e.sensitiveKey ? "eve-sensitive" : "eve-stable",
        taskId: taskId ?? e.taskId ?? null,
        url: e.url,
        ...(e.stableKey ? { eveStableKey: e.stableKey } : {}),
        ...(e.sensitiveKey ? { eveSensitiveKey: e.sensitiveKey } : {}),
        provenance: "eve-perception",
    };
}
function humanCanonical(h, taskId) {
    return {
        kind: "human",
        // Nested state task IDs are honored: a step carrying its task inside
        // `state` must not lose it when no top-level id is present.
        taskId: taskId ?? h.taskId ?? h.state?.taskId ?? null,
        url: h.url ?? h.state?.url ?? null,
        ...(h.state?.eveStableKey ? { eveStableKey: h.state.eveStableKey } : {}),
        ...(h.state?.eveSensitiveKey ? { eveSensitiveKey: h.state.eveSensitiveKey } : {}),
        ...(h.state?.externalStateId ? { externalStateId: h.state.externalStateId } : {}),
        provenance: "human-report",
    };
}
function labelsMatch(humanLabel, eveLabel) {
    if (!humanLabel)
        return false;
    const h = humanLabel.trim().toLowerCase();
    const e = eveLabel.trim().toLowerCase();
    return h.length > 0 && (e.includes(h) || h.includes(e));
}
/**
 * Align human steps to EVE steps. Deterministic: same inputs →
 * byte-identical alignment. Greedy earliest-match, strictly monotone
 * (non-crossing); each step used at most once on either side. Steps from
 * conflicting tasks never pair at any level.
 */
export function alignTraces(human, eve, opts = {}) {
    const usedEve = new Set();
    let floor = -1;
    const pairs = [];
    const unmatchedHuman = [];
    /** True when both sides name a task and the names disagree. */
    const taskConflicts = (humanTask, e) => {
        const eveTask = opts.taskId ?? e.taskId ?? null;
        return (humanTask != null &&
            humanTask.trim() !== "" &&
            eveTask != null &&
            eveTask.trim() !== "" &&
            !matchTaskIds(humanTask, eveTask));
    };
    for (const h of human) {
        const hc = humanCanonical(h, opts.taskId);
        let match = null;
        // Pass 1: state identity (strongest first). Canonical matching already
        // refuses task disagreement, so any basis here is task-compatible.
        for (const e of eve) {
            if (e.index <= floor || usedEve.has(e.index))
                continue;
            const basis = canonicalMatchBasis(hc, eveCanonical(e, opts.taskId));
            if (basis === "task+stable" ||
                basis === "task+sensitive" ||
                basis === "task+external-id" ||
                basis === "stable" ||
                basis === "sensitive" ||
                basis === "external-id") {
                match = { index: e.index, basis };
                break;
            }
        }
        // Pass 2: action semantics — skipped entirely on task conflict.
        if (!match) {
            for (const e of eve) {
                if (e.index <= floor || usedEve.has(e.index))
                    continue;
                if (taskConflicts(hc.taskId, e))
                    continue;
                if (h.actionKind && h.actionKind === e.actionKind) {
                    match = { index: e.index, basis: "action-kind" };
                    break;
                }
            }
        }
        if (!match) {
            for (const e of eve) {
                if (e.index <= floor || usedEve.has(e.index))
                    continue;
                if (taskConflicts(hc.taskId, e))
                    continue;
                if (labelsMatch(h.actionLabel, e.actionLabel)) {
                    match = { index: e.index, basis: "action-label" };
                    break;
                }
            }
        }
        // Pass 3: order proximity fallback (weak — flagged by basis).
        // Also task-gated: positional pairing across experiments is meaningless.
        if (!match) {
            const fallback = eve.find((e) => e.index > floor && !usedEve.has(e.index) && !taskConflicts(hc.taskId, e));
            if (fallback)
                match = { index: fallback.index, basis: "order" };
        }
        if (match) {
            usedEve.add(match.index);
            floor = match.index;
            pairs.push({ humanIndex: h.index, eveIndex: match.index, basis: match.basis });
        }
        else {
            unmatchedHuman.push(h.index);
        }
    }
    const unmatchedEve = eve.map((e) => e.index).filter((i) => !usedEve.has(i));
    return {
        pairs,
        unmatchedHuman,
        unmatchedEve,
        coverage: {
            humanMatched: pairs.length,
            humanTotal: human.length,
            eveMatched: pairs.length,
            eveTotal: eve.length,
        },
        method: "greedy earliest-match, strictly monotone: task+state identity → action semantics → order fallback",
        limitations: [
            "Greedy matching can misalign repeated identical states.",
            "Order-proximity pairs are positional fallback, not correspondence evidence.",
            "Action-label matching is case-insensitive substring — crude for paraphrase.",
            "No fuzzy/embedding similarity is attempted in this pass by design.",
        ],
    };
}
/**
 * Validate + normalize a raw human-study object carrying optional per-step
 * detail into `HumanStep[]`. All step fields optional: a pilot dataset may
 * carry only actions, a full dataset adds targets, durations, corrections,
 * recovery, and self-reports. Unknown fields are ignored, never trusted.
 */
export function importHumanSteps(raw) {
    if (!Array.isArray(raw))
        throw new Error("Human steps must be an array.");
    return raw.map((t, i) => {
        if (typeof t !== "object" || t === null)
            throw new Error(`Human step ${i} must be an object.`);
        const tr = t;
        const str = (v) => (typeof v === "string" ? v : undefined);
        const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
        const recovery = typeof tr.recovery === "object" && tr.recovery !== null
            ? tr.recovery
            : undefined;
        const state = typeof tr.state === "object" && tr.state !== null
            ? parseCanonicalState(tr.state)
            : undefined;
        const selfReport = typeof tr.selfReport === "object" && tr.selfReport !== null
            ? parseSelfReport(tr.selfReport)
            : undefined;
        return {
            index: typeof tr.index === "number" ? tr.index : i,
            ...(str(tr.taskId) ? { taskId: str(tr.taskId) } : {}),
            ...(str(tr.url) ? { url: str(tr.url) } : {}),
            ...(str(tr.actionKind) ? { actionKind: str(tr.actionKind) } : {}),
            ...(str(tr.actionLabel) ? { actionLabel: str(tr.actionLabel) } : {}),
            ...(str(tr.target) ? { target: str(tr.target) } : {}),
            ...(num(tr.timestampMs) !== undefined ? { timestampMs: num(tr.timestampMs) } : {}),
            ...(num(tr.durationMs) !== undefined ? { durationMs: num(tr.durationMs) } : {}),
            ...(str(tr.transitionTo) ? { transitionTo: str(tr.transitionTo) } : {}),
            ...(str(tr.outcome) ? { outcome: str(tr.outcome) } : {}),
            ...(str(tr.correction) ? { correction: str(tr.correction) } : {}),
            ...(recovery ? { recovery } : {}),
            ...(state ? { state } : {}),
            ...(selfReport ? { selfReport } : {}),
            ...(typeof tr.abandoned === "boolean" ? { abandoned: tr.abandoned } : {}),
        };
    });
}
/**
 * Validate a nested canonical state reference. Only known primitive
 * fields are admitted; unknown or mistyped fields are dropped, never
 * trusted. `kind` defaults to "human" — a human log is the expected
 * source here.
 */
function parseCanonicalState(raw) {
    const str = (v) => (typeof v === "string" ? v : undefined);
    const kind = str(raw.kind);
    const out = {
        kind: kind === "eve-stable" || kind === "eve-sensitive" || kind === "agent" ? kind : "human",
        taskId: str(raw.taskId) ?? null,
        url: str(raw.url) ?? null,
        ...(str(raw.eveStableKey) ? { eveStableKey: str(raw.eveStableKey) } : {}),
        ...(str(raw.eveSensitiveKey) ? { eveSensitiveKey: str(raw.eveSensitiveKey) } : {}),
        ...(str(raw.externalStateId) ? { externalStateId: str(raw.externalStateId) } : {}),
        provenance: "human-report",
    };
    return out;
}
/** Validate a self-report map: finite numeric values only. */
function parseSelfReport(raw) {
    const entries = Object.entries(raw).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "number" && Number.isFinite(entry[1]));
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
//# sourceMappingURL=alignment.js.map