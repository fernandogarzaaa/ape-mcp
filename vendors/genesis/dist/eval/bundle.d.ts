/**
 * Reproducibility manifest + exportable evidence bundle.
 *
 * experiment/
 * ├── manifest.json      — genesis version, spec/dataset digests, env, seeds
 * ├── claim.json         — the claim (if any)
 * ├── specification.json — the evaluation spec (redacted)
 * ├── dataset.json       — dataset identity + schema
 * ├── baseline/          — results.jsonl + metrics.json (when present)
 * ├── treatment/         — results.jsonl + metrics.json
 * ├── ablations/         — per-arm results (when present)
 * ├── statistics.json    — per-arm stats + paired comparisons
 * ├── findings.json
 * ├── evidence/          — evidence.jsonl (every record, digested)
 * ├── verdict.json       — verdict with claim boundaries
 * └── report.html        — offline single-file report rendered from the bundle
 */
import type { ExperimentResult } from "./runner.js";
import type { EvalSpec } from "./spec.js";
export declare const GENESIS_VERSION = "0.3.0";
export interface Manifest {
    readonly genesis_version: string;
    readonly created_at: string;
    readonly spec_digest: string;
    readonly dataset_digest: string;
    readonly env_digest: string;
    readonly runtime: Record<string, unknown>;
    readonly seeds: readonly (number | string)[];
    readonly repetitions: number;
    readonly ledger_entry: string | null;
}
export declare function buildManifest(spec: EvalSpec, result: ExperimentResult, options?: {
    ledgerEntry?: string | null;
    repoPath?: string;
}): Manifest;
export declare function writeEvidenceBundle(dir: string, spec: EvalSpec, result: ExperimentResult, manifest: Manifest): void;
export declare function readEvidenceBundle(dir: string): {
    verdict: unknown;
    manifest: unknown;
    metrics: unknown;
};
/**
 * Trust bundle: the evaluation evidence bundle plus evaluator assurance.
 *
 * <dir>/evaluation/...   (standard evidence bundle)
 * <dir>/assurance.json   (dataset-derived probes + optional suite audit)
 * <dir>/trust.json       (combined TRUSTED | UNTRUSTED | INCONCLUSIVE)
 * <dir>/gate.json        (release-gate decision, when `genesis gate` ran)
 */
export declare function writeTrustBundle(dir: string, spec: EvalSpec, result: ExperimentResult, manifest: Manifest, assurance: unknown, trust: unknown, gate?: unknown): void;
//# sourceMappingURL=bundle.d.ts.map