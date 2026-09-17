/**
 * The audit runner: fire a probe suite at a verifier, record everything, conclude.
 *
 * Impure by necessity — it spawns processes. Everything it learns is
 * materialized into `ProbeResult[]` and handed to the pure `concludeAudit`,
 * so the conclusion is replayable from the ledger without re-running anything.
 */
import type { Ledger } from "../ledger/ledger.js";
import { type AuditConclusion, type ProbeResult } from "./findings.js";
import { type Probe, type ProbeSuite } from "./probe.js";
import type { Judge } from "./verifier.js";
export declare class AuditError extends Error {
    readonly name = "AuditError";
}
export interface AuditEvents {
    onProbeStart?(probe: Probe, index: number, total: number): void;
    onProbeFinish?(result: ProbeResult): void;
}
export interface AuditRecord {
    readonly verifier: string;
    readonly suite: string;
    readonly suite_version: string;
    readonly suite_digest: string;
    readonly conclusion: AuditConclusion;
    readonly results: readonly ProbeResult[];
    readonly ledger_entry: string | null;
}
export interface AuditOptions {
    readonly verifier: Judge;
    readonly suite: ProbeSuite;
    readonly ledger?: Ledger;
    readonly events?: AuditEvents;
}
export declare function runAudit(options: AuditOptions): Promise<AuditRecord>;
/** Exit codes, matching the acceptance CLI's discipline. */
export declare const AUDIT_EXIT: {
    readonly SOUND: 0;
    readonly EXPLOITABLE: 1;
    readonly UNRELIABLE: 2;
    readonly OVER_STRICT: 2;
    readonly INTERNAL_ERROR: 3;
};
export declare function exitCodeFor(verdict: AuditConclusion["verdict"]): number;
//# sourceMappingURL=audit.d.ts.map