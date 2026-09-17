/**
 * Verifier defect taxonomy.
 *
 * Adopted from Ray, "Before the Model Learns the Bug: Fuzzing RLVR Verifiers"
 * (arXiv 2606.01066), which enumerates eleven defect classes across three
 * domains. We build against that taxonomy rather than deriving our own: it is
 * published, it is specific, and rediscovering it would be the exact mistake
 * `docs/research/04-REDIRECTION-REVIEW.md` warns against.
 *
 * The premise, which is the whole reason this module exists: **a verifier is
 * executable software, and its bugs become rewardable failure modes.** An agent
 * optimizing against a verifier with a hole will find the hole. Auditing the
 * instrument before trusting its measurements is ordinary engineering hygiene
 * that the agent ecosystem mostly does not do.
 */
export declare const DOMAINS: readonly ["math", "json", "code"];
export type Domain = (typeof DOMAINS)[number];
export declare const DEFECT_CLASSES: readonly ["loose_answer_extraction", "missing_markers", "contradiction_blindness", "loose_numeric_tolerance", "schema_only_validation", "ignored_extra_fields", "duplicate_key_handling", "embedded_json_parsing", "visible_test_overfitting", "stdout_spoofing", "missing_timeouts"];
export type DefectClass = (typeof DEFECT_CLASSES)[number];
export interface DefectDescriptor {
    readonly id: DefectClass;
    readonly domain: Domain;
    readonly title: string;
    /** What the verifier does wrong. */
    readonly defect: string;
    /** What an agent gains by exploiting it. */
    readonly exploit: string;
}
export declare const TAXONOMY: Readonly<Record<DefectClass, DefectDescriptor>>;
export declare function descriptorsFor(domain: Domain): DefectDescriptor[];
//# sourceMappingURL=taxonomy.d.ts.map