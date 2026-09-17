import type { Percept, VisibleElement } from "../core/types.js";
import type { CognitiveContext } from "./cognition.js";
/**
 * Salience: which visible element pulls the operator's attention.
 *
 * Humans don't evaluate every control rationally — attention is drawn by a
 * blend of goal relevance, visual prominence, novelty and habit, and
 * repelled by perceived risk. The weights below encode that blend, with
 * persona traits shifting the balance (a curious explorer weighs novelty
 * heavily; an anxious user weighs risk heavily).
 */
export interface SalienceScore {
    readonly element: VisibleElement;
    readonly total: number;
    readonly goalRelevance: number;
    readonly prominence: number;
    readonly novelty: number;
    readonly risk: number;
}
export declare function riskOf(element: VisibleElement): number;
/** Visual prominence: size, position, being a "real" control. */
export declare function prominenceOf(element: VisibleElement, percept: Percept): number;
export declare function goalRelevanceOf(element: VisibleElement, goalKeywords: readonly string[]): number;
/**
 * Score every candidate interactive element on the current screen.
 */
export declare function scoreAffordances(ctx: CognitiveContext, goalKeywords: readonly string[]): SalienceScore[];
/** Reading load of the current screen, 0..1 (drives cognitive effort). */
export declare function readingLoad(percept: Percept): number;
/** Choice overload: too many competing interactive elements, 0..1. */
export declare function choiceLoad(percept: Percept): number;
//# sourceMappingURL=salience.d.ts.map