/**
 * Minting CP/1 documents from EVE's internals.
 *
 * EVE authors three canonical types, and this module is the only place they are
 * created. Centralizing it keeps two invariants that would otherwise be
 * scattered: every document is sealed before it leaves, and every document
 * declares `authored_by: "eve"` — the field ADAM checks to confirm a
 * `FitnessResult` came from something with no stake in the outcome.
 *
 * The mapping from EVE's rich internal state to the canonical types is lossy on
 * purpose. A `Percept` carries screenshots, layout geometry and per-element
 * colors; an `Observation` carries what the operator could report having seen.
 * The protocol's job is to convey evidence across a boundary, not to replicate
 * one component's state inside another.
 */
import type { LoopIteration, Percept } from "../core/types.js";
import type { Component, CpEvent, EventKind, Experience, Observation, PayloadValue, Provenance, SubjectType, Surface } from "./types.js";
/** Build a provenance record stamped with the current instant. */
export declare function provenance(options: {
    authoredBy?: Component;
    origin: string;
    evidence?: readonly string[];
    derivedFrom?: readonly string[];
    producedAt?: string;
}): Provenance;
/**
 * Project a {@link Percept} onto a CP/1 {@link Observation}.
 *
 * Signals are the visible text an operator would be able to recount: headings,
 * body text and dialog copy, in the order they were perceived. Affordances are
 * the controls they could see and tell you about. Everything else in the
 * percept — geometry, colors, screenshot buffers, scroll offsets — stays inside
 * EVE, because none of it is a fact another component can act on.
 */
export declare function observationFrom(options: {
    percept: Percept;
    environmentId: string;
    surface: Surface;
    latencyMs: number;
    errorPerceived: boolean;
    /** Cap on how many signals to carry; the rest are noise across a boundary. */
    maxSignals?: number;
}): Observation;
/**
 * Project a {@link LoopIteration} onto a CP/1 {@link Experience}.
 *
 * The outcome is derived from the prediction comparison rather than reported
 * separately, so it can never disagree with the surprise value beside it.
 */
export declare function experienceFrom(options: {
    iteration: LoopIteration;
    observationId: string;
    sessionOrigin: string;
}): Experience;
/**
 * Mint a CP/1 event.
 *
 * `actor` is constrained by the event kind, never chosen freely by the caller.
 * See {@link actorFor}.
 */
export declare function event(options: {
    kind: EventKind;
    actor?: Component;
    subjectId: string;
    subjectType: SubjectType;
    correlationId: string;
    causationId?: string;
    payload?: Readonly<Record<string, PayloadValue>>;
    origin: string;
    derivedFrom?: readonly string[];
}): CpEvent;
//# sourceMappingURL=documents.d.ts.map