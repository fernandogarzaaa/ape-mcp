/**
 * Defect taxonomy for behavioral/simulation oracles — EVE's `goalAchieved` and
 * anything shaped like it.
 *
 * Deliberately kept separate from `taxonomy.ts`. That table is Ray's
 * published eleven classes for RLVR verifiers (arXiv 2606.01066); folding a
 * new class into it would misrepresent the citation. This table is this
 * project's own finding, recorded in full in
 * `docs/assurance/findings/EVE-001-goal-signal-text-match.md`, and it says so.
 *
 * The premise mirrors Ray's, one layer up: an RLVR verifier grades a
 * *submitted completion* against a task; a behavioral oracle like EVE grades
 * an *unfolding session* against a stated goal, using a decision rule that is
 * itself software and can itself have bugs. EVE's rule — a success signal is
 * satisfied by lowercase substring containment against all currently visible
 * screen text, with no distinction between text an operator merely saw and an
 * action an operator took — was found to accept sessions where nothing
 * resembling the goal was performed.
 */
export declare const BEHAVIORAL_DOMAINS: readonly ["behavioral"];
export type BehavioralDomain = (typeof BEHAVIORAL_DOMAINS)[number];
export declare const BEHAVIORAL_DEFECT_CLASSES: readonly ["zero_interaction_success", "incidental_label_match"];
export type BehavioralDefectClass = (typeof BEHAVIORAL_DEFECT_CLASSES)[number];
export interface BehavioralDefectDescriptor {
    readonly id: BehavioralDefectClass;
    readonly domain: BehavioralDomain;
    readonly title: string;
    readonly defect: string;
    readonly exploit: string;
}
export declare const BEHAVIORAL_TAXONOMY: Readonly<Record<BehavioralDefectClass, BehavioralDefectDescriptor>>;
export declare function behavioralDescriptorsFor(domain: BehavioralDomain): BehavioralDefectDescriptor[];
//# sourceMappingURL=behavioral-taxonomy.d.ts.map