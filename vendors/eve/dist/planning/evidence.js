import { visualOnlyText } from "../observation/provenance.js";
const STRONG = {
    "text-proxy": "weak",
    "visual-confirmation": "moderate",
    "state-transition": "strong",
    "destination-state": "strong",
    "workflow-terminal": "strong",
};
function evidence(kind, detail, textOnly) {
    return { kind, strength: STRONG[kind], detail, textOnly };
}
export function matchSignal(haystack, signal) {
    const lower = signal.toLowerCase();
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const left = /^\w/.test(lower) ? "\\b" : "";
    const right = /\w$/.test(lower) ? "\\b" : "";
    return new RegExp(`${left}${escaped}${right}`).test(haystack);
}
/**
 * Assess goal completion with evidence grading.
 *
 * `visibleHaystack` is the full visible-text match surface (backwards
 * compatible: includes accessibility fallbacks). `renderedHaystack` is the
 * visual-only text. When the signal matches only the former, the claim is
 * graded "text-proxy" with a warning instead of silently masquerading as
 * causal completion.
 */
export function assessGoal(opts) {
    const warnings = [];
    const { signals } = opts;
    if (signals.length === 0)
        return { achieved: false, evidence: [], warnings };
    const visible = opts.visibleHaystack.toLowerCase();
    const rendered = (opts.renderedHaystack ?? opts.visibleHaystack).toLowerCase();
    const allVisible = signals.every((s) => matchSignal(visible, s));
    if (!allVisible)
        return { achieved: false, evidence: [], warnings };
    const allRendered = signals.every((s) => matchSignal(rendered, s));
    const ev = [];
    if (opts.workflowTerminal) {
        ev.push(evidence("workflow-terminal", `workflow detector reports terminal state for [${signals.join(", ")}]`, false));
    }
    if (opts.atDestinationState) {
        ev.push(evidence("destination-state", `at declared destination state ${opts.url ?? ""} with [${signals.join(", ")}] present`, false));
    }
    if (opts.screenChangedSinceAction) {
        ev.push(evidence("state-transition", `screen identity changed after action and [${signals.join(", ")}] present`, false));
    }
    if (allRendered) {
        ev.push(evidence("visual-confirmation", `[${signals.join(", ")}] present in rendered (sighted-visible) text`, true));
    }
    else {
        warnings.push(`success signal(s) [${signals.join(", ")}] matched DOM/accessibility-derived text but NOT rendered visible text — weak text-proxy evidence only.`);
        ev.push(evidence("text-proxy", `[${signals.join(", ")}] matched text-proxy surface only (accessibility fallback or control label)`, true));
    }
    return { achieved: true, evidence: ev, warnings };
}
/** Convenience: grade a percept pair without threading strings manually. */
export function assessGoalOnPercepts(opts) {
    return assessGoal({
        signals: opts.signals,
        visibleHaystack: opts.visibleText,
        renderedHaystack: visualOnlyText(opts.percept),
        screenChangedSinceAction: opts.screenChangedSinceAction,
        atDestinationState: opts.atDestinationState,
        workflowTerminal: opts.workflowTerminal,
        url: opts.url ?? opts.percept.url,
    });
}
//# sourceMappingURL=evidence.js.map