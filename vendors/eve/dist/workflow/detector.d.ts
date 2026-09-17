import type { Percept } from "../core/types.js";
import { type WorkflowKind } from "./catalog.js";
/**
 * Classify the workflow a screen belongs to, from perception alone.
 * Returns the best-scoring workflow kind plus a confidence in 0..1.
 */
export interface WorkflowMatch {
    readonly kind: WorkflowKind;
    readonly confidence: number;
}
export declare function detectWorkflow(percept: Percept): WorkflowMatch;
//# sourceMappingURL=detector.d.ts.map