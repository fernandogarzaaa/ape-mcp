import { BEHAVIOR_MODEL_VERSION, implementationRevision, PARAMETER_SET_VERSION, } from "../core/versions.js";
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
    const traits = opts.personaTraits ?? result.personaTraits;
    if (!traits) {
        throw new Error("buildCalibrationRecords: no persona traits — pass opts.personaTraits or use a SessionResult carrying personaTraits");
    }
    const policy = opts.policy ?? result.policyName ?? "unknown";
    const surfaceAdapter = opts.surfaceAdapter ?? result.surfaceAdapter ?? "unknown";
    const surfaceAdapterVersion = opts.surfaceAdapterVersion ?? result.surfaceAdapterVersion ?? null;
    return result.iterations.map((it) => ({
        version: 1,
        seed: result.seed,
        persona: result.personaName,
        personaTraits: traits,
        policy,
        step: it.step,
        timestampMs: it.timestamp,
        url: it.url,
        goal: it.goal,
        subgoal: it.subgoal,
        stableKey: it.stableKey ?? null,
        sensitiveKey: it.sensitiveKey ?? null,
        actionKind: it.action.kind,
        actionDescription: it.actionDescription,
        rationale: it.rationale,
        prediction: it.prediction,
        outcome: it.outcome,
        emotion: it.emotion,
        provenance: sectionProvenance(it.outcome),
        calibrationStatus: "uncalibrated",
        behaviorModelVersion: BEHAVIOR_MODEL_VERSION,
        parameterSetVersion: PARAMETER_SET_VERSION,
        calibrationDatasetVersion: null,
        surfaceAdapter,
        surfaceAdapterVersion,
        implementationRevision: implementationRevision(),
        humanReference: null,
    }));
}
/** Wrap records with session metadata for dataset export. */
export function buildCalibrationDataset(result, opts = {}) {
    return {
        version: 1,
        persona: result.personaName,
        seed: result.seed,
        startUrl: result.startUrl,
        endReason: result.endReason,
        goalAchieved: result.goalAchieved,
        records: buildCalibrationRecords(result, opts),
        generatedAt: new Date().toISOString(),
    };
}
/** One JSON object per line — the append-friendly calibration-dataset format. */
export function renderCalibrationRecordsJsonl(records) {
    if (records.length === 0)
        return "";
    return `${records.map((r) => JSON.stringify(r)).join("\n")}\n`;
}
//# sourceMappingURL=record.js.map