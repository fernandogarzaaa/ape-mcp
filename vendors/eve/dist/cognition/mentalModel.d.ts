import type { Modality } from "../core/registry.js";
import type { Percept, Prediction, PredictionOutcome, VisibleElement } from "../core/types.js";
export declare function tokenize(text: string): string[];
/** All human-readable text on the screen, flattened. */
export declare function visibleText(percept: Percept): string;
/**
 * Visible text excluding the labels of interactive controls.
 *
 * The difference between this and {@link visibleText} is the difference
 * between "the screen says the export finished" and "the screen has a button
 * that says Export". Used to tell whether a goal success signal is carried
 * only by an affordance the operator may never have activated.
 */
export declare function passiveText(percept: Percept): string;
/**
 * Layered error evidence (P1.4). Plain lexical matching confuses "Error
 * rate: 1.2%", "Required reading" or "Failed experiments" (content ABOUT
 * failure) with an application failure the operator faces. Strength order:
 *
 * 1. semantic role (alert/dialog) — strong, "observed";
 * 2. native dialog carrying error text — strong, "observed";
 * 3. form-validation context (disabled/invalid-adjacent interactive element
 *    with error text) — moderate, "derived";
 * 4. bare lexical match — weak fallback, "heuristic", filtered against
 *    known false-positive prose contexts.
 *
 * Lexical detection is kept (backwards compat) but graded weak.
 */
export type ErrorEvidenceLevel = "strong" | "moderate" | "weak" | "none";
export interface ErrorEvidence {
    readonly level: ErrorEvidenceLevel;
    readonly provenance: "observed" | "derived" | "heuristic";
    readonly snippets: readonly string[];
}
export declare function classifyErrorEvidence(percept: Percept, modality?: Modality): ErrorEvidence;
/**
 * Is a visible error message perceivable on this screen?
 *
 * Layered evidence (P1.4) via {@link classifyErrorEvidence}: semantic
 * role/dialog matches count as strong observed evidence; bare lexical
 * matches are weak heuristic evidence filtered against false-positive
 * prose ("Error rate", "Required reading", ...).
 *
 * Document-modality gating is unchanged (see history): prose *about*
 * failures on a page of text is not a failure the reader faces.
 */
export declare function perceivesError(percept: Percept, modality?: Modality): boolean;
/** Error text snippets, for evidence in findings. See {@link perceivesError}. */
export declare function errorSnippets(percept: Percept, modality?: Modality): string[];
/**
 * Build a prediction for interacting with an element, from nothing but its
 * visible label and the operator's conventions knowledge (techLiteracy is
 * applied by the caller as a confidence modifier).
 */
export declare function predictInteraction(element: VisibleElement, verb: "click" | "type", baseConfidence: number): Prediction;
/**
 * Compare a prediction against the screen that actually followed the action.
 * This is where "was my expectation correct?" gets a number.
 */
export declare function comparePrediction(prediction: Prediction, before: Percept, after: Percept, perceivedLatencyMs: number, modality?: Modality): PredictionOutcome;
/**
 * The operator's running one-sentence theory of what the application is.
 * Rebuilt whenever a more informative screen appears.
 */
export declare function inferAppTheory(percept: Percept): string;
//# sourceMappingURL=mentalModel.d.ts.map