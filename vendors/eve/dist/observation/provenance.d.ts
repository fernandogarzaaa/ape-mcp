import type { EvidenceProvenance, ObservationSource, Percept, VisibleElement } from "../core/types.js";
/**
 * Evidence-provenance helpers (P0.3 / P1.10).
 *
 * The perception script tags each element's `textSource`; these helpers let
 * cognition and evaluation ask "where did this string come from?" instead of
 * treating every string as seen. Accessibility fallbacks (aria-label, alt,
 * title) remain available for accessibility testing — they are labeled, not
 * removed.
 */
/** Where an element's text came from; legacy elements default to visual-or-unknown. */
export declare function textSourceOf(el: VisibleElement): ObservationSource;
/** True when a sighted human would literally read this element's text. */
export declare function isHumanVisibleText(el: VisibleElement): boolean;
/** Elements whose text a sighted human reads (aria/alt/title fallbacks excluded). */
export declare function visuallyGroundedElements(percept: Percept): readonly VisibleElement[];
/**
 * Visible text grounded in rendered pixels only. Contrast with `visibleText`,
 * which includes accessibility fallbacks for backwards compatibility and
 * accessibility auditing. Goal and error evidence should prefer this when
 * the claim is "the human saw X".
 */
export declare function visualOnlyText(percept: Percept): string;
/** Accessibility-sourced strings, kept available for accessibility testing. */
export declare function accessibilitySourcedText(percept: Percept): string;
/** Classify a metric/finding's epistemic status for reporting. */
export declare function provenanceOf(kind: "observed" | "derived" | "heuristic" | "model"): EvidenceProvenance;
//# sourceMappingURL=provenance.d.ts.map