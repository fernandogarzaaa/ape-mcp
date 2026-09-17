/**
 * The shared CP/1 conformance suite, as EVE runs it.
 *
 * Every binding, in every repository, runs the same checks against the same
 * golden corpus. That is the entire mechanism keeping three hand-written
 * bindings in three languages agreeing about the wire — there is no code
 * generation and no shared library to enforce it, so this is load-bearing.
 *
 * The checks and what each catches:
 *
 * 1. **Round trip** — parsing a fixture and re-encoding it reproduces the exact
 *    bytes. Catches key ordering, number rendering or escaping that differs
 *    from the normative source.
 * 2. **Seal** — each `provenance.content_hash` is the true hash of the document
 *    with that member removed. Catches hashing different bytes than are sent.
 * 3. **Structure** — required members present, `_bp` members integral and in
 *    range. Catches accepting a float where the protocol forbids one.
 * 4. **Manifest** — the vendored corpus hashes to what the normative source
 *    recorded. Catches running against a stale copy, which would make checks
 *    1–3 pass against the wrong contract.
 * 5. **Provenance edges** — `derived_from` ids resolve within the corpus;
 *    `baseline.runs` equals `candidate.runs`; and a measured `FitnessResult`
 *    references a `SimulationCompleted` whose `subject_id` and reported run
 *    counts match. Catches a measurement that cannot be chained back to the
 *    specific run that produced it — including one that cites a real run for
 *    the wrong mutation, or the wrong count — which is indistinguishable from
 *    a fabricated one.
 */
import { type EventKind } from "./types.js";
export interface ConformanceFailure {
    /** 1-based line in the corpus, or 0 for a corpus-wide failure. */
    readonly line: number;
    readonly documentType: string;
    readonly detail: string;
}
export declare function isEventKind(value: string): value is EventKind;
/** Run checks 1–3 over a fixture corpus (the contents of `canonical.jsonl`). */
export declare function checkCorpus(corpus: string): ConformanceFailure[];
/**
 * Check 4: verify vendored files against the normative manifest.
 *
 * `files` maps manifest-relative paths to the bytes this repository has. Paths
 * not supplied are skipped, so a binding that vendors only the fixtures need
 * not also carry `SPEC.md`.
 */
export declare function checkManifest(manifest: string, files: Readonly<Record<string, string>>): string[];
/** Render failures as a single readable block for an assertion message. */
export declare function describeFailures(failures: readonly ConformanceFailure[]): string;
//# sourceMappingURL=conformance.d.ts.map