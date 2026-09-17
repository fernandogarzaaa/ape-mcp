/**
 * Audit report rendering.
 *
 * Structured findings, each citing the probe that produced it and the digest of
 * the stored transcript — the schema ABA (arXiv 2605.26079) uses for benchmark
 * auditing, applied to verifiers. A finding you cannot trace back to a specific
 * input and a specific response is an opinion.
 */
import type { AuditRecord } from "./audit.js";
export declare function renderAudit(record: AuditRecord, options?: {
    verbose?: boolean;
}): string;
//# sourceMappingURL=report.d.ts.map