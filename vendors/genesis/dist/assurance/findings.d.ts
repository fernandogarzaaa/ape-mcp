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
import { type Interval } from "../backtest/metrics.js";
import type { AnyDefectClass, Probe } from "./probe.js";
import type { Observed } from "./verifier.js";
/** Descriptors from both taxonomies, keyed by defect class. Neither table needs to know the other exists. */
export declare const ALL_DESCRIPTORS: Readonly<Record<AnyDefectClass, {
    title: string;
    defect: string;
    exploit: string;
}>>;
/** What the verifier did, judged against what a correct one must do. */
export type ProbeOutcome = "correct"
/** Accepted a completion that satisfies a defect but not the task. */
 | "false_accept"
/** Rejected a genuinely correct completion. */
 | "false_reject"
/** Never returned a verdict. On an exploit probe this is itself a defect. */
 | "unresponsive"
/** The verifier could not be invoked or its output was unreadable. */
 | "error";
export interface ProbeResult {
    readonly probe_id: string;
    readonly defect_class: AnyDefectClass;
    readonly expected: Probe["expect"];
    readonly observed: Observed;
    readonly outcome: ProbeOutcome;
    readonly rationale: string;
    readonly note: string | null;
    readonly duration_ms: number;
    /** Digest of the stored transcript. Every finding cites one. */
    readonly artifact_digest: string | null;
}
export declare function classifyOutcome(expected: Probe["expect"], observed: Observed): ProbeOutcome;
export type Severity = "exploitable" | "unreliable" | "over_strict";
export interface Finding {
    readonly defect_class: AnyDefectClass;
    readonly title: string;
    readonly severity: Severity;
    readonly summary: string;
    /** What an agent gains. From the taxonomy. */
    readonly exploit: string;
    /** The probes that demonstrate it. */
    readonly evidence: readonly ProbeResult[];
}
export interface ClassStats {
    readonly defect_class: AnyDefectClass;
    readonly exploit_probes: number;
    readonly false_accepts: number;
    readonly unresponsive: number;
    readonly errors: number;
}
export interface AuditMetrics {
    readonly probes_run: number;
    readonly exploit_probes: number;
    readonly control_probes: number;
    /** P(accepted | should have been rejected). The defect signal. */
    readonly false_accept_rate: Interval;
    /** P(rejected | genuinely correct). The over-strictness signal. */
    readonly false_reject_rate: Interval;
    /** Fraction of probes the verifier could not answer at all. */
    readonly error_rate: Interval;
    readonly exploitable_classes: readonly AnyDefectClass[];
    readonly by_class: readonly ClassStats[];
}
export interface AuditConclusion {
    readonly metrics: AuditMetrics;
    readonly findings: readonly Finding[];
    /** Overall verdict on the verifier's fitness to carry reward. */
    readonly verdict: "SOUND" | "EXPLOITABLE" | "UNRELIABLE" | "OVER_STRICT";
    readonly rationale: readonly string[];
}
/**
 * The pure core. Same probe results in, same conclusion out, forever.
 */
export declare function concludeAudit(results: readonly ProbeResult[]): AuditConclusion;
//# sourceMappingURL=findings.d.ts.map