/**
 * The payoff: comparing what is drawn against what the page claims.
 *
 * EVE's perception script walks the DOM, so everything EVE knows about a page
 * is what the page says about itself. That is the right default — it is fast,
 * exact, and it is also what assistive technology reads. But it is a claim,
 * not an observation, and the interesting failures are precisely where the
 * claim and the rendering disagree:
 *
 *   - the DOM offers a control that isn't drawn, so EVE would "click" a
 *     thing no person can see;
 *   - the DOM carries text that never reached the screen, because a
 *     stylesheet, a font, or an overlay ate it;
 *   - the screen carries content the DOM knows nothing about, because it was
 *     painted into a canvas or baked into an image — invisible to EVE, to a
 *     screen reader, and to every DOM-based testing tool.
 *
 * The last one is the reason this module exists. No DOM-only tool can see it,
 * because there is nothing in the DOM to see.
 *
 * Every check below is deliberately conservative: a wrong finding here tells
 * someone their working page is broken, which is worse than staying quiet.
 * Where a signal is ambiguous, nothing is reported.
 */
import type { BoundingBox, Percept, Viewport } from "../core/types.js";
import type { RenderingObservation } from "./types.js";
export type RenderingIssueKind = 
/** The DOM offers an interactive element; nothing is rendered where it sits. */
"phantom-control"
/** The DOM carries text; the pixels in its box are blank. */
 | "unrendered-text"
/** The screen carries content no DOM element accounts for. */
 | "unaccounted-content";
export interface RenderingIssue {
    readonly kind: RenderingIssueKind;
    readonly box: BoundingBox;
    /** One sentence, in the terms a person would use. */
    readonly detail: string;
    /** The DOM element involved, when the disagreement starts from one. */
    readonly elementId?: number;
    /** The element's text, when it has any — quoted as evidence. */
    readonly text?: string;
}
/** Perceive a screenshot. Returns null when there is nothing to look at. */
export declare function observe(screenshot: Buffer | null, viewport: Viewport): RenderingObservation | null;
/**
 * Shorten a quotation for a headline, preferring a word boundary.
 *
 * Cutting mid-word ("but invisib") reads as a rendering bug in the report
 * itself, which is a poor look for a tool whose whole subject is text that
 * did not come out right. Falls back to a hard cut when a single word is
 * longer than the budget.
 */
export declare function abbreviate(text: string, max?: number): string;
/**
 * Compare the rendering against the DOM's account of it.
 *
 * Takes the observation rather than re-deriving it so a caller that already
 * looked at this screenshot does not pay for the grid twice.
 */
export declare function reconcile(percept: Percept, observation: RenderingObservation): RenderingIssue[];
/** Perceive and reconcile in one step, for callers holding only a percept. */
export declare function inspect(percept: Percept): {
    observation: RenderingObservation | null;
    issues: readonly RenderingIssue[];
};
//# sourceMappingURL=reconcile.d.ts.map