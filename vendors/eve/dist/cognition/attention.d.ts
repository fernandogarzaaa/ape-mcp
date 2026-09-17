import type { Rng } from "../core/random.js";
import type { Percept, Point, VisibleElement } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
/**
 * Selective attention model.
 *
 * Humans never observe everything on a screen: attention is allocated as a
 * sequence of fixations, and only fixated content enters cognition. This
 * module approximates that process using the SEEV allocation model
 * (Salience + Effort + Expectancy + Value; Wickens 2003) over the visible
 * elements, an F-pattern scanning prior (Nielsen 2006, mirrored under RTL),
 * and fixation/saccade timing from reading research (Rayner 1998).
 *
 * Consequences downstream:
 * - Decision policies choose only among *attended* elements.
 * - Changes to unattended elements are not perceived (change blindness;
 *   Rensink et al. 1997) and are logged as missed changes.
 * - Strong goal focus suppresses peripheral capture (inattentional
 *   blindness; Simons & Chabris 1999).
 *
 * See docs/research.md for the full grounding.
 */
export interface Fixation {
    readonly elementId: number;
    readonly point: Point;
    readonly durationMs: number;
    readonly order: number;
    /** Saccade distance from the previous fixation, in px. */
    readonly saccadePx: number;
}
export interface AttentionSnapshot {
    readonly fixations: readonly Fixation[];
    /** Element ids admitted into cognition this glance. */
    readonly attendedIds: ReadonlySet<number>;
    /** Elements that changed since the previous percept but were not attended. */
    readonly missedChanges: readonly VisibleElement[];
    /** Total simulated glance time, ms. */
    readonly glanceMs: number;
    /** 0..1 — how strongly attention was captured by the goal (drives blindness). */
    readonly goalFocus: number;
}
/** Visual salience of one element (size, contrast, color, role). */
export declare function visualSalience(el: VisibleElement, percept: Percept): number;
export interface AttentionOptions {
    readingDirection?: "ltr" | "rtl";
}
/**
 * Allocate one glance of attention to the current percept.
 */
export declare function allocateAttention(percept: Percept, previousPercept: Percept | null, goalKeywords: readonly string[], persona: Persona, rng: Rng, options?: AttentionOptions): AttentionSnapshot;
/** Restrict a percept to its attended elements (what cognition may use). */
export declare function attendedPercept(percept: Percept, snapshot: AttentionSnapshot): Percept;
//# sourceMappingURL=attention.d.ts.map