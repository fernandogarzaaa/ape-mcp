/**
 * Evaluator assurance: can we trust the mechanism deciding whether the system works?
 *
 * Two interoperable modes, both reusing the evaluation's own evaluator:
 *
 * 1. Dataset-derived probes (default). Synthesizes controls (gold outputs that
 *    must be accepted) and must-reject exploits (empty, input echo, another
 *    task's gold, gold padded with junk) from the evaluation dataset, plus
 *    informational stress probes (case/whitespace brittleness). Verdicts use
 *    the same vocabulary as the RLVR assurance module — SOUND | EXPLOITABLE |
 *    UNRELIABLE | OVER_STRICT — without touching its published taxonomy.
 *
 * 2. Suite bridge (`--suite code|json|math|behavioral`). Runs the spec's
 *    evaluator as an in-process Judge against the existing adversarial probe
 *    suites, yielding real taxonomy findings (e.g. an exact-match evaluator
 *    accepts the unmarked "42" it should reject per the task's marker rule).
 *
 * Abstinence policy: an evaluator that returns null (abstains) on a
 * must-reject probe is safe — it did not accept garbage — and is recorded as
 * a caveat, not a defect. Abstaining on a control is a false reject: an
 * evaluator that cannot judge gold cannot carry a verdict.
 */
import { type AuditRecord } from "../assurance/audit.js";
import type { EvalSpec } from "./spec.js";
import type { EvaluationVerdict } from "./types.js";
export type AssuranceVerdict = "SOUND" | "EXPLOITABLE" | "UNRELIABLE" | "OVER_STRICT";
export type AssuranceProbeKind = "control" | "must_reject" | "stress";
export interface AssuranceProbe {
    readonly id: string;
    readonly kind: AssuranceProbeKind;
    /** Exploit template: empty | echo-input | wrong-gold | padded-gold | case-flip | whitespace. */
    readonly template: string;
    readonly task_id: string;
    readonly output: unknown;
    readonly rationale: string;
}
export type AssuranceOutcome = "correct" | "false_accept" | "false_reject" | "abstained" | "stress_note";
export interface AssuranceProbeResult {
    readonly probe_id: string;
    readonly kind: AssuranceProbeKind;
    readonly template: string;
    readonly observed: "accept" | "reject" | "abstain";
    readonly outcome: AssuranceOutcome;
    readonly detail?: Record<string, unknown>;
}
export interface AssuranceFinding {
    readonly severity: "exploitable" | "over_strict" | "brittle" | "info";
    readonly summary: string;
    readonly template?: string;
    readonly probes: readonly string[];
}
export interface EvaluatorAssurance {
    readonly evaluator: string;
    readonly dataset: string;
    readonly dataset_digest: string;
    readonly probes_run: number;
    readonly controls: number;
    readonly must_rejects: number;
    readonly false_accept_rate: {
        point: number;
        low: number;
        high: number;
        n: number;
    };
    readonly false_reject_rate: {
        point: number;
        low: number;
        high: number;
        n: number;
    };
    readonly abstains: number;
    readonly verdict: AssuranceVerdict;
    readonly rationale: readonly string[];
    readonly findings: readonly AssuranceFinding[];
    readonly results: readonly AssuranceProbeResult[];
    readonly suite_audit?: AuditRecord;
}
export declare function assureEvaluator(spec: EvalSpec, options?: {
    stdinData?: string;
    suite?: string;
    maxTasks?: number;
}): Promise<EvaluatorAssurance>;
/**
 * Run the spec's evaluator as an in-process Judge against a published
 * adversarial probe suite. Probe tasks adapt to EvalTasks (prompt → input,
 * reference → reference, full task visible under context); the probe
 * completion is the output under judgment.
 */
export declare function auditSpecEvaluatorAgainstSuite(spec: EvalSpec, suiteName: string): Promise<AuditRecord>;
export type TrustVerdict = "TRUSTED" | "UNTRUSTED" | "INCONCLUSIVE";
export interface TrustJudgment {
    readonly trust: TrustVerdict;
    readonly system_verdict: EvaluationVerdict;
    readonly evaluator_verdict: AssuranceVerdict;
    readonly reasons: readonly string[];
}
export declare function decideTrust(system: EvaluationVerdict, evaluator: AssuranceVerdict): TrustJudgment;
export declare function renderAssurance(a: EvaluatorAssurance): string;
export declare function renderTrust(systemLabel: string, systemSummary: string, assurance: EvaluatorAssurance, trust: TrustJudgment): string;
//# sourceMappingURL=assurance.d.ts.map