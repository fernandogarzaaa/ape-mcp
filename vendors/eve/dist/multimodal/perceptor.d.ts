/**
 * The default, deterministic multimodal perceptor. It recognizes visual
 * constructs from the perceived elements, loading indicator, and dialogs of a
 * `Percept` — and, when real screenshots are present, motion between frames.
 */
import type { Percept } from "../core/types.js";
import type { MultimodalCues, MultimodalPerceptor } from "./types.js";
export declare class HeuristicMultimodalPerceptor implements MultimodalPerceptor {
    readonly name = "heuristic";
    perceive(percept: Percept, previous?: Percept): MultimodalCues;
}
/** The shared default perceptor instance. */
export declare const DEFAULT_MULTIMODAL_PERCEPTOR: MultimodalPerceptor;
//# sourceMappingURL=perceptor.d.ts.map