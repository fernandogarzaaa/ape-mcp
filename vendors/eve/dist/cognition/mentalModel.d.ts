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
 * Is a visible error message perceivable on this screen?
 *
 * The patterns match prose, which is the right call on a surface the operator
 * is *driving*: "Invalid password" on a login form is an error they are
 * facing. On a document surface it is the wrong call, and badly so — a
 * quarterly report line reading "Error rate: 0.4%" is a *topic*, not a
 * failure, and a stack trace quoted in a bug report is something the reader
 * is reading about rather than something happening to them. There is nothing
 * to retry or dismiss on a page of text, so a document never presents the
 * reader with an error to recover from. What the artifact says about errors
 * is the comprehension model's business (`src/humanity/comprehension.ts`),
 * where an unexplained failure with no next step is a finding about the
 * *writing*.
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