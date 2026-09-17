/** Direction of "good" for each metric (higher-is-better vs lower-is-better). */
const HIGHER_IS_BETTER = {
    overallScore: true,
    meanConfidence: true,
    meanTrust: true,
    productiveSteps: false, // fewer productive steps to the same goal is better
};
const LOWER_IS_BETTER = [
    "steps",
    "durationMs",
    "backtracks",
    "revisitRatio",
    "deadClicks",
    "errors",
    "surpriseRate",
    "peakFrustration",
    "meanCognitiveLoadIndex",
    "hesitationEvents",
];
export function extractMetrics(result) {
    const outcomes = result.iterations
        .map((it) => it.outcome)
        .filter((o) => o !== null);
    const deadClicks = outcomes.filter((o) => o.prediction.expectsChange && !o.screenChanged).length;
    const errors = outcomes.filter((o) => o.errorPerceived).length;
    const surpriseRate = outcomes.length
        ? outcomes.filter((o) => o.surprise > 0.5).length / outcomes.length
        : 0;
    const backtracks = result.iterations.filter((it) => it.action.kind === "back").length;
    const productiveSteps = result.iterations.filter((it) => it.action.kind !== "wait" && it.action.kind !== "read").length;
    // Hesitation proxy: high-effort steps preceding a click.
    const hesitationEvents = result.iterations.filter((it) => (it.action.kind === "read" || it.action.kind === "wait") && it.step > 0).length;
    const meanEmotion = (key) => {
        if (result.emotionTimeline.length === 0)
            return 0.5;
        return (result.emotionTimeline.reduce((s, e) => s + e.values[key], 0) / result.emotionTimeline.length);
    };
    const peakEmotion = (key) => result.emotionTimeline.reduce((m, e) => Math.max(m, e.values[key]), 0);
    return {
        overallScore: result.scores.find((s) => s.dimension === "overall")?.value ?? 0,
        completed: result.goalAchieved,
        abandoned: result.abandoned,
        steps: result.usage.steps,
        productiveSteps,
        durationMs: result.usage.durationMs,
        backtracks,
        revisitRatio: revisitRatioOf(result),
        deadClicks,
        errors,
        surpriseRate: Number(surpriseRate.toFixed(3)),
        meanConfidence: Number(meanEmotion("confidence").toFixed(3)),
        peakFrustration: Number(peakEmotion("frustration").toFixed(3)),
        meanTrust: Number(meanEmotion("trust").toFixed(3)),
        meanCognitiveLoadIndex: result.cognitiveLoad ? result.cognitiveLoad.meanIndex : null,
        hesitationEvents,
    };
}
function revisitRatioOf(result) {
    const nodes = result.workflowNodes;
    if (nodes.length === 0)
        return 0;
    return Number((nodes.filter((n) => n.visits > 2).length / nodes.length).toFixed(3));
}
/**
 * Compare two sessions and produce a regression report. Thresholds are
 * relative; tiny stochastic differences are ignored.
 */
export function compareExperience(baseline, candidate, labels = {}) {
    const base = extractMetrics(baseline);
    const cand = extractMetrics(candidate);
    const deltas = [];
    const numericKeys = Object.keys(base).filter((k) => typeof base[k] === "number");
    for (const metric of numericKeys) {
        const b = base[metric];
        const c = cand[metric];
        if (b === null || c === null || (b === 0 && c === 0))
            continue;
        const delta = Number((c - b).toFixed(3));
        const higherBetter = HIGHER_IS_BETTER[metric] ?? !LOWER_IS_BETTER.includes(metric);
        const worse = higherBetter ? delta < 0 : delta > 0;
        const relative = b !== 0 ? Math.abs(delta) / Math.abs(b) : Math.abs(delta);
        const meaningful = relative > 0.1 && Math.abs(delta) > epsilonFor(metric);
        deltas.push({
            metric,
            baseline: b,
            candidate: c,
            delta,
            regression: worse && meaningful,
            severity: worse && meaningful ? severityFor(metric, relative) : "none",
        });
    }
    // Completion/abandonment transitions are always significant.
    if (base.completed && !cand.completed) {
        deltas.push({
            metric: "completed",
            baseline: 1,
            candidate: 0,
            delta: -1,
            regression: true,
            severity: "critical",
        });
    }
    if (!base.abandoned && cand.abandoned) {
        deltas.push({
            metric: "abandoned",
            baseline: 0,
            candidate: 1,
            delta: 1,
            regression: true,
            severity: "critical",
        });
    }
    const regressions = deltas
        .filter((d) => d.regression)
        .sort((a, b) => rank(a.severity) - rank(b.severity));
    const improvements = deltas.filter((d) => !d.regression &&
        Math.abs(d.delta) > epsilonFor(d.metric) &&
        d.severity === "none" &&
        isImprovement(d));
    const verdict = regressions.some((r) => r.severity === "critical" || r.severity === "major")
        ? "regressed"
        : regressions.length > improvements.length
            ? "regressed"
            : improvements.length > 0 && regressions.length === 0
                ? "improved"
                : "unchanged";
    return {
        baselineLabel: labels.baseline ?? "baseline",
        candidateLabel: labels.candidate ?? "candidate",
        deltas,
        regressions,
        verdict,
        summary: summarize(verdict, regressions, base, cand),
    };
}
function isImprovement(d) {
    const higherBetter = HIGHER_IS_BETTER[d.metric] ?? !LOWER_IS_BETTER.includes(d.metric);
    return higherBetter ? d.delta > 0 : d.delta < 0;
}
function epsilonFor(metric) {
    switch (metric) {
        case "durationMs":
            return 500;
        case "overallScore":
            return 3;
        case "steps":
        case "productiveSteps":
        case "backtracks":
        case "deadClicks":
        case "errors":
        case "hesitationEvents":
            return 1;
        default:
            return 0.05;
    }
}
function severityFor(metric, relative) {
    if (metric === "overallScore" && relative > 0.25)
        return "critical";
    if (relative > 0.5)
        return "major";
    if (relative > 0.25)
        return "major";
    return "minor";
}
function rank(sev) {
    return { critical: 0, major: 1, minor: 2, none: 3 }[sev];
}
function summarize(verdict, regressions, base, cand) {
    if (verdict === "unchanged") {
        return "No meaningful experience change between builds — behaviorally and cognitively equivalent.";
    }
    if (verdict === "improved") {
        return `The candidate build improved the experience (overall ${base.overallScore} → ${cand.overallScore}) with no meaningful regressions.`;
    }
    const worst = regressions[0];
    const detail = worst
        ? ` Most significant: ${labelMetric(worst.metric)} moved ${worst.baseline} → ${worst.candidate}.`
        : "";
    return `The candidate build regressed the experience despite (potentially) still functioning. ${regressions.length} cognitive/behavioral metric(s) got worse.${detail}`;
}
function labelMetric(metric) {
    return metric.replace(/([A-Z])/g, " $1").toLowerCase();
}
//# sourceMappingURL=regression.js.map