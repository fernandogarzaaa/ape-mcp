/**
 * Release gate: the capability checkpoint.
 *
 * A gate binds a dangerous capability to its required certifications:
 * the system verdict, the forbidden-metric ceilings, the evaluator's
 * soundness, and the combined trust — all computed from the same evidence.
 * Fail-closed: RELEASE requires everything to hold; missing evidence,
 * an untrusted evaluator, or a breached ceiling BLOCKS (or INCONCLUSIVE
 * when the evidence itself is insufficient rather than damning).
 *
 * Ceilings come from `spec.gate.forbidden` ({metric: max allowed value}).
 * A forbidden metric that cannot be computed is a breach: an unmeasured
 * dangerous capability is not an absent one.
 */
import type { EvaluatorAssurance } from "./assurance.js";
import type { ExperimentResult } from "./runner.js";
export type GateDecision = "RELEASE" | "BLOCK" | "INCONCLUSIVE";
export interface GateBreach {
    readonly kind: "forbidden" | "system" | "evaluator" | "trust" | "evidence";
    readonly detail: string;
}
export interface GateResult {
    readonly decision: GateDecision;
    readonly system_verdict: ExperimentResult["verdict"]["verdict"];
    readonly evaluator_verdict: EvaluatorAssurance["verdict"];
    readonly trust: "TRUSTED" | "UNTRUSTED" | "INCONCLUSIVE";
    readonly breaches: readonly GateBreach[];
    readonly reasons: readonly string[];
}
export declare function decideGate(result: ExperimentResult, assurance: EvaluatorAssurance, trust: GateResult["trust"], forbidden?: Record<string, number>): GateResult;
export declare function renderGate(label: string, forbidden: Record<string, number>, gate: GateResult): string;
//# sourceMappingURL=gate.d.ts.map