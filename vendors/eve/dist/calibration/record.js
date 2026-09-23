import { PARAMETER_SET_VERSION } from "../core/versions.js";
import { buildExperienceTrace } from "../trace/trace.js";
import { snapshotParameters } from "./parameters.js";
function sectionProvenance(outcome) {
    return {
        observation: "observed",
        cognitiveState: "derived",
        prediction: "derived",
        action: "observed",
        ...(outcome ? { outcome: "derived" } : {}),
        ...(outcome?.latencyEvidence
            ? {
                latency: outcome.latencyEvidence.deterministic
                    ? "modeled"
                    : "observed",
            }
            : {}),
        ...(outcome?.motorTimeMs !== undefined ? { motorTime: "modeled" } : {}),
        emotionUpdate: "heuristic",
    };
}
/** Build per-step calibration records from a finished session result. */
export function buildCalibrationRecords(result, opts = {}) {
    // Canonical path (Phase 7): records derive from the experience trace,
    // never directly from the result. Output is identical to the legacy
    // direct mapping (pinned by test) — the trace is now the primitive.
    const trace = buildExperienceTrace(result);
    return recordsFromTrace(trace, {
        personaTraits: opts.personaTraits ?? result.personaTraits,
        policy: opts.policy ?? result.policyName,
        surfaceAdapter: opts.surfaceAdapter ?? result.surfaceAdapter,
        surfaceAdapterVersion: opts.surfaceAdapterVersion ?? result.surfaceAdapterVersion,
    });
}
/**
 * Map an experience trace to per-step research rows. Pure function of the
 * trace: same trace → byte-identical records.
 */
export function recordsFromTrace(trace, opts = {}) {
    const traits = opts.personaTraits ?? trace.personaTraits;
    if (!traits) {
        throw new Error("recordsFromTrace: no persona traits — pass opts.personaTraits or use a trace carrying personaTraits");
    }
    const policy = opts.policy ?? trace.model.policy;
    const surfaceAdapter = opts.surfaceAdapter ?? trace.surfaceAdapter;
    const surfaceAdapterVersion = opts.surfaceAdapterVersion ?? trace.surfaceAdapterVersion;
    return trace.steps.map((st) => ({
        version: 1,
        seed: trace.seed,
        persona: trace.persona,
        personaTraits: traits,
        policy,
        step: st.index,
        timestampMs: st.timestampMs,
        url: st.stateBefore.url,
        goal: st.goal,
        subgoal: st.subgoal,
        stableKey: st.stateBefore.stableKey,
        sensitiveKey: st.stateBefore.sensitiveKey,
        actionKind: st.selectedAction.kind,
        actionDescription: st.actionDescription,
        rationale: st.rationale,
        prediction: st.prediction,
        outcome: st.outcome,
        emotion: st.affective,
        provenance: sectionProvenance(st.outcome),
        calibrationStatus: "uncalibrated",
        behaviorModelVersion: trace.model.behaviorModelVersion,
        parameterSetVersion: trace.model.parameterSetVersion,
        calibrationDatasetVersion: null,
        surfaceAdapter,
        surfaceAdapterVersion,
        implementationRevision: trace.model.implementationRevision,
        humanReference: null,
    }));
}
/** Wrap records with session metadata for dataset export. */
export function buildCalibrationDataset(result, opts = {}) {
    const trace = buildExperienceTrace(result);
    return {
        version: 1,
        persona: result.personaName,
        seed: result.seed,
        startUrl: result.startUrl,
        endReason: result.endReason,
        goalAchieved: result.goalAchieved,
        records: recordsFromTrace(trace, opts),
        generatedAt: new Date().toISOString(),
        taskId: trace.taskId,
        parameterSet: snapshotParameters(PARAMETER_SET_VERSION),
        ...(opts.environment ? { environment: opts.environment } : {}),
    };
}
/** One JSON object per line — the append-friendly calibration-dataset format. */
export function renderCalibrationRecordsJsonl(records) {
    if (records.length === 0)
        return "";
    return `${records.map((r) => JSON.stringify(r)).join("\n")}\n`;
}
//# sourceMappingURL=record.js.map