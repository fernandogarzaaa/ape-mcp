/**
 * Audit findings and metrics. Pure — no I/O, no clock, no randomness.
 *
 * Same discipline as the acceptance layer's adjudicator, for the same reason:
 * an audit conclusion that cannot be recomputed from its recorded probe results
 * is not auditable, and an assurance tool that is not itself auditable is a
 * joke. `tests/assurance.purity.test.ts` enforces it.
 *
 * Reuses `wilson` from the backtest module. Per-class probe counts are small —
 * often two or three — so a bare point estimate would be actively misleading,
 * and the interval is not decoration.
 */
import { wilson } from "../backtest/metrics.js";
import { TAXONOMY } from "./taxonomy.js";
import { BEHAVIORAL_TAXONOMY } from "./behavioral-taxonomy.js";
/** Descriptors from both taxonomies, keyed by defect class. Neither table needs to know the other exists. */
export const ALL_DESCRIPTORS = {
    ...TAXONOMY,
    ...BEHAVIORAL_TAXONOMY,
};
export function classifyOutcome(expected, observed) {
    if (observed === "error")
        return "error";
    if (observed === "unresponsive") {
        // A verifier that hangs on an adversarial input has not "errored" — it has
        // failed to reject in bounded time, which is the exploitable condition. On
        // a control probe the same behavior is merely unreliable.
        return expected === "reject" ? "unresponsive" : "error";
    }
    if (expected === "reject")
        return observed === "accept" ? "false_accept" : "correct";
    return observed === "reject" ? "false_reject" : "correct";
}
/**
 * The pure core. Same probe results in, same conclusion out, forever.
 */
export function concludeAudit(results) {
    // Sorted so the conclusion cannot depend on completion order.
    const sorted = [...results].sort((a, b) => (a.probe_id < b.probe_id ? -1 : a.probe_id > b.probe_id ? 1 : 0));
    const exploits = sorted.filter((r) => r.expected === "reject");
    const controls = sorted.filter((r) => r.expected === "accept");
    const falseAccepts = exploits.filter((r) => r.outcome === "false_accept");
    const unresponsive = exploits.filter((r) => r.outcome === "unresponsive");
    const falseRejects = controls.filter((r) => r.outcome === "false_reject");
    const errors = sorted.filter((r) => r.outcome === "error");
    const byClass = collectClassStats(exploits);
    const exploitable = byClass
        .filter((c) => c.false_accepts > 0 || c.unresponsive > 0)
        .map((c) => c.defect_class);
    const metrics = {
        probes_run: sorted.length,
        exploit_probes: exploits.length,
        control_probes: controls.length,
        // Unresponsive counts against the verifier: it failed to reject.
        false_accept_rate: wilson(falseAccepts.length + unresponsive.length, exploits.length),
        false_reject_rate: wilson(falseRejects.length, controls.length),
        error_rate: wilson(errors.length, sorted.length),
        exploitable_classes: exploitable,
        by_class: byClass,
    };
    const findings = buildFindings(sorted, exploitable, falseRejects);
    const { verdict, rationale } = decide(metrics, controls.length);
    return { metrics, findings, verdict, rationale };
}
function collectClassStats(exploits) {
    const classes = new Map();
    for (const result of exploits) {
        const list = classes.get(result.defect_class);
        if (list)
            list.push(result);
        else
            classes.set(result.defect_class, [result]);
    }
    return [...classes.keys()]
        .sort()
        .map((defect_class) => {
        const group = classes.get(defect_class) ?? [];
        return {
            defect_class,
            exploit_probes: group.length,
            false_accepts: group.filter((r) => r.outcome === "false_accept").length,
            unresponsive: group.filter((r) => r.outcome === "unresponsive").length,
            errors: group.filter((r) => r.outcome === "error").length,
        };
    });
}
function buildFindings(results, exploitable, falseRejects) {
    const findings = [];
    for (const defect_class of exploitable) {
        const descriptor = ALL_DESCRIPTORS[defect_class];
        const evidence = results.filter((r) => r.defect_class === defect_class && (r.outcome === "false_accept" || r.outcome === "unresponsive"));
        const hung = evidence.some((r) => r.outcome === "unresponsive");
        findings.push({
            defect_class,
            title: descriptor.title,
            severity: "exploitable",
            summary: hung
                ? `${descriptor.defect} The verifier did not return a verdict within its bound on ${evidence.length} probe(s).`
                : `${descriptor.defect} The verifier accepted ${evidence.length} completion(s) it should have rejected.`,
            exploit: descriptor.exploit,
            evidence,
        });
    }
    if (falseRejects.length > 0) {
        // Reported as its own finding: a verifier that rejects correct work is
        // broken in the opposite direction and will be worked around or disabled.
        findings.push({
            defect_class: falseRejects[0]?.defect_class ?? "schema_only_validation",
            title: "Rejects correct completions",
            severity: "over_strict",
            summary: `The verifier rejected ${falseRejects.length} control probe(s) — completions that genuinely ` +
                "satisfy the task. Over-strictness is not the safe direction: it is the failure mode that " +
                "gets a gate switched off.",
            exploit: "None. This defect costs the operator rather than rewarding the agent.",
            evidence: falseRejects,
        });
    }
    return findings;
}
function decide(metrics, controls) {
    const rationale = [];
    if (metrics.error_rate.point > 0.25) {
        rationale.push(`The verifier failed to produce a readable verdict on ${pct(metrics.error_rate.point)} of probes. ` +
            "No conclusion about its soundness is available until it answers reliably.");
        return { verdict: "UNRELIABLE", rationale };
    }
    if (metrics.exploitable_classes.length > 0) {
        rationale.push(`${metrics.exploitable_classes.length} defect class(es) are exploitable: ` +
            `${metrics.exploitable_classes.join(", ")}. False-accept rate ` +
            `${pct(metrics.false_accept_rate.point)} across ${metrics.exploit_probes} exploit probe(s).`);
        return { verdict: "EXPLOITABLE", rationale };
    }
    if (controls === 0) {
        rationale.push("No control probes were run, so a verifier that rejects everything would be " +
            "indistinguishable from a sound one. Verdict withheld.");
        return { verdict: "UNRELIABLE", rationale };
    }
    if (metrics.false_reject_rate.point > 0) {
        rationale.push(`No exploit succeeded, but the verifier rejected ${pct(metrics.false_reject_rate.point)} of ` +
            "correct completions. It is sound against this suite and unusable in practice.");
        return { verdict: "OVER_STRICT", rationale };
    }
    rationale.push(`No exploit succeeded across ${metrics.exploit_probes} probe(s) and all ${controls} control(s) ` +
        "were accepted. Sound against this suite — which bounds the claim to the defect classes it covers.");
    return { verdict: "SOUND", rationale };
}
function pct(value) {
    return `${(value * 100).toFixed(1)}%`;
}
//# sourceMappingURL=findings.js.map