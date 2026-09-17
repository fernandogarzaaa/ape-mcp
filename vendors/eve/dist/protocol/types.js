/**
 * CP/1 canonical types, as EVE sees them.
 *
 * EVE owns three: {@link Observation}, {@link Experience} and
 * {@link FitnessResult}. It reads {@link Mutation} and {@link ValidationRequest}
 * to know what to measure. Those five are declared here in full.
 *
 * The remaining canonical types (Genome, Belief, Memory, Skill, Identity,
 * Capability, Reflection, Context) are ADAM's or AXIOM's to author and EVE
 * never handles them, so they are deliberately absent: a declaration EVE never
 * uses would still have to be kept in step with the schema forever. Agreement
 * on those types is established structurally, over the shared fixture corpus,
 * by the conformance suite — which tests the encoding, the thing that actually
 * has to match across bindings.
 *
 * See `protocol/cp1/SPEC.md` section 3.
 */
/**
 * The CP/1 canonical action verbs. This set is closed on the wire: adding a
 * verb changes the canonical form and is a protocol version change (SPEC §8),
 * not an edit here. Engine-side verbs beyond this set live in
 * `actionVerbRegistry` (`src/protocol/verbs.ts`) and never serialize into an
 * `Experience`.
 */
export const EXPERIENCE_ACTIONS = [
    "click",
    "type",
    "press",
    "scroll",
    "navigate",
    "back",
    "read",
    "wait",
    "abandon",
];
/** Every event the organism can emit. The set is closed. */
export const EVENT_KINDS = [
    "ObservationRecorded",
    "ExperienceCreated",
    "ContextCompressed",
    "GroundingFailed",
    "MemoryConsolidated",
    "BeliefUpdated",
    "SkillLearned",
    "ReflectionCompleted",
    "MutationProposed",
    "SimulationCompleted",
    "TaskRunCompleted",
    "FitnessMeasured",
    "MutationAccepted",
    "MutationRejected",
    "GenomeCommitted",
];
export const SUBJECT_TYPES = [
    "Identity",
    "Genome",
    "Capability",
    "Belief",
    "Memory",
    "Skill",
    "Mutation",
    "Reflection",
    "Observation",
    "Experience",
    "FitnessResult",
    "Context",
];
/** Whether a value is a payload member the canonical encoder will accept. */
export function isPayloadValue(value) {
    if (typeof value === "string" || typeof value === "boolean")
        return true;
    return typeof value === "number" && Number.isSafeInteger(value);
}
/**
 * The components permitted to emit each event. Ownership of an event follows
 * ownership of the concept it announces, so this is checkable: an
 * `ObservationRecorded` from ADAM means ADAM minted an EVE-owned fact.
 *
 * Fourteen of the fifteen kinds have exactly one permitted emitter.
 * `FitnessMeasured` has two, because two independent evaluators can honestly
 * score a mutation — EVE against simulated experience, PCR against the real
 * objective — and a single `Component` here could only answer by naming the
 * wrong one for the other. The permission stays closed: two named components,
 * not "anyone". Mirrors `EventKind::emitters` on the Rust side.
 */
export const EVENT_EMITTER = {
    ObservationRecorded: ["eve"],
    ExperienceCreated: ["eve"],
    SimulationCompleted: ["eve"],
    TaskRunCompleted: ["pcr"],
    FitnessMeasured: ["eve", "pcr"],
    ContextCompressed: ["axiom"],
    GroundingFailed: ["axiom"],
    MemoryConsolidated: ["adam"],
    BeliefUpdated: ["adam"],
    SkillLearned: ["adam"],
    ReflectionCompleted: ["adam"],
    MutationProposed: ["adam"],
    MutationAccepted: ["adam"],
    MutationRejected: ["adam"],
    GenomeCommitted: ["adam"],
};
//# sourceMappingURL=types.js.map