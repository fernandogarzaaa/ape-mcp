/**
 * Human validation engine — import anonymized human usability traces and score
 * how closely EVE's simulated population matches real human behaviour.
 */
export { alignTraces, importHumanSteps } from "./alignment.js";
export { calibrate, importHumanStudy } from "./calibration.js";
export { fingerprintEnvironment } from "./environment.js";
export { brierScore, meanLogDurationError, spearmanRankCorrelation, topKAgreement, transitionDivergenceL1, } from "./metrics.js";
export { BEHAVIOR_PARAMETERS, getParameter, parametersByClass, snapshotParameters, } from "./parameters.js";
export { buildCalibrationDataset, buildCalibrationRecords, recordsFromTrace, renderCalibrationRecordsJsonl, } from "./record.js";
export { renderCalibrationMarkdown } from "./report.js";
export { isSecretFieldName, REDACTED_EMAIL, REDACTED_SECRET, redactTextSecrets, sanitizeCanonicalState, sanitizeHumanStep, sanitizeHumanStudy, sanitizeHumanTrace, sanitizeTraceUrl, } from "./sanitize.js";
//# sourceMappingURL=index.js.map