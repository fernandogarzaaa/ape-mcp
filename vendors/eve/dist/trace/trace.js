import { seedFromString } from "../core/random.js";
import { BEHAVIOR_MODEL_VERSION, implementationRevision, PARAMETER_SET_VERSION, } from "../core/versions.js";
import { sensitiveStateKey, stableIdentityKey } from "../memory/surfaceIdentity.js";
/** Deterministic trace identity from the run's generating parameters. */
export function traceIdFor(opts) {
    return `eve-${seedFromString([String(opts.seed), opts.persona, opts.taskId ?? "-", opts.startUrl].join("|")).toString(36)}`;
}
/** Strip a percept to a serializable snapshot (screenshot buffer removed). */
export function stripPercept(percept) {
    const { screenshot: _dropped, ...rest } = percept;
    return { ...rest, screenshot: null };
}
function refOf(url, stableKey, sensitiveKey) {
    return {
        url,
        stableKey: stableKey ?? null,
        sensitiveKey: sensitiveKey ?? null,
    };
}
/**
 * Build the canonical trace from a finished session result. Pure and
 * deterministic: same result → byte-identical trace (verified by test).
 *
 * `stateAfter` uses the RECORDED immediate observation
 * (`LoopIteration.stateAfter`) whenever present — it is the genuine
 * post-action percept, while the next step's before-state is a LATER
 * observation that may already include settle drift. Only when no
 * recording exists (older results, crashed runs) does the builder fall
 * back to next-before chaining, then the terminal observation. The final
 * action's after-state is the terminal observation. Abandon steps (no
 * actuation) reuse stateBefore.
 */
export function buildExperienceTrace(result, opts = {}) {
    const taskId = opts.taskId ?? result.taskId ?? null;
    const traceId = traceIdFor({
        seed: result.seed,
        persona: result.personaName,
        taskId,
        startUrl: result.startUrl,
    });
    const goal = result.iterations[0]?.goal ?? "";
    const steps = result.iterations.map((it, i) => {
        const next = result.iterations[i + 1];
        const isAbandon = it.action.kind === "abandon";
        const before = refOf(it.url, it.stableKey, it.sensitiveKey);
        // Prefer the RECORDED immediate post-action observation: it is the
        // genuine after-state, while next-before chaining can already include
        // settle drift. Keys are recomputed from the snapshot (snapshots carry
        // percepts, not keys) with default state options.
        const recorded = it.stateAfter
            ? refOf(it.stateAfter.url, stableIdentityKey(it.stateAfter), sensitiveStateKey(it.stateAfter))
            : null;
        const stateAfter = isAbandon
            ? before
            : (recorded ??
                (next
                    ? refOf(next.url, next.stableKey, next.sensitiveKey)
                    : result.terminalState
                        ? refOf(result.terminalState.url, result.terminalState.stableKey, result.terminalState.sensitiveKey)
                        : null));
        return {
            index: it.step,
            timestampMs: it.timestamp,
            stateBefore: before,
            ...(it.choiceSet ? { choiceSet: it.choiceSet } : {}),
            selectedAction: it.action,
            actionDescription: it.actionDescription,
            rationale: it.rationale,
            goal: it.goal,
            subgoal: it.subgoal,
            prediction: it.prediction,
            timing: {
                ...(it.outcome?.motorTimeMs !== undefined ? { motorTimeMs: it.outcome.motorTimeMs } : {}),
                ...(it.outcome ? { perceivedLatencyMs: it.outcome.perceivedLatencyMs } : {}),
                ...(it.outcome?.latencyEvidence ? { latencyEvidence: it.outcome.latencyEvidence } : {}),
            },
            stateAfter,
            outcome: it.outcome,
            affective: it.emotion,
            provenance: {
                observation: "observed",
                choice: it.choiceSet ? "derived" : "modeled",
                prediction: "derived",
                action: "observed",
                timing: it.outcome?.latencyEvidence
                    ? it.outcome.latencyEvidence.deterministic
                        ? "modeled"
                        : "observed"
                    : "modeled",
                outcome: it.outcome ? "derived" : "modeled",
                affective: "heuristic",
            },
        };
    });
    const first = result.iterations[0];
    const lastEmotion = result.emotionTimeline.at(-1)?.values ?? null;
    const terminal = result.terminalState
        ? {
            url: result.terminalState.url,
            title: result.terminalState.title,
            timestampMs: result.terminalState.timestampMs,
            step: result.terminalState.step,
            stableKey: result.terminalState.stableKey,
            sensitiveKey: result.terminalState.sensitiveKey,
            elementCount: result.terminalState.elementCount,
            dialogCount: result.terminalState.dialogCount,
            text: result.terminalState.text,
            endReason: result.endReason,
            ...(lastEmotion ? { affective: { ...lastEmotion } } : {}),
            ...(result.abandoned
                ? {
                    abandonment: {
                        timeToAbandonMs: first != null ? result.terminalState.timestampMs - first.timestamp : null,
                        stepToAbandon: result.terminalState.step,
                        stateKey: result.terminalState.sensitiveKey,
                        cause: result.abandonReason,
                        lastActionKind: result.iterations.length > 0
                            ? result.iterations[result.iterations.length - 1].action
                                .kind
                            : null,
                        lastSurprise: result.iterations.length > 0
                            ? (result.iterations[result.iterations.length - 1].outcome?.surprise ?? null)
                            : null,
                        goalAchieved: result.goalAchieved,
                    },
                }
                : {}),
        }
        : null;
    return {
        version: 1,
        traceId,
        sessionId: traceId,
        taskId,
        model: {
            behaviorModelVersion: opts.behaviorModelVersion ?? BEHAVIOR_MODEL_VERSION,
            parameterSetVersion: opts.parameterSetVersion ?? PARAMETER_SET_VERSION,
            policy: result.policyName ?? "unknown",
            implementationRevision: opts.implementationRevision ?? implementationRevision(),
        },
        persona: result.personaName,
        ...(result.personaTraits ? { personaTraits: result.personaTraits } : {}),
        seed: result.seed,
        startUrl: result.startUrl,
        goal,
        surfaceAdapter: result.surfaceAdapter ?? "unknown",
        surfaceAdapterVersion: result.surfaceAdapterVersion ?? null,
        initialState: first ? refOf(first.url, first.stableKey, first.sensitiveKey) : null,
        steps,
        terminal,
        endReason: result.endReason,
        goalAchieved: result.goalAchieved,
        abandoned: result.abandoned,
    };
}
/** Deterministic serialization (insertion-ordered JSON). */
export function renderTraceJson(trace) {
    return JSON.stringify(trace, null, 2);
}
/** Append-friendly one-record-per-line export. */
export function renderTraceJsonl(trace) {
    return `${JSON.stringify(trace)}\n`;
}
//# sourceMappingURL=trace.js.map