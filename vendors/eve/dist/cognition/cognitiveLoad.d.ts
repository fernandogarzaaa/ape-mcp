import type { Percept } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
/**
 * Cognitive load estimation.
 *
 * Estimates the *extraneous* cognitive load an interface imposes — the part
 * of load the design owns, as opposed to intrinsic task difficulty
 * (Cognitive Load Theory; Sweller 1988). The decomposition follows NASA-TLX
 * style multi-component workload (Hart & Staveland 1988) and visual-clutter
 * measures (Rosenholtz et al. 2007).
 *
 * Components (each 0..1, "load" so higher is worse):
 * - workingMemoryLoad: interactive choices vs. the operator's WM capacity
 *   (Hick–Hyman: choice load grows with log2 of options).
 * - informationLoad: reading burden on the screen.
 * - decisionLoad: competing plausible actions.
 * - visualClutter: element density + disorganization.
 * - taskSwitchLoad: how far this screen is from the previous (context switch).
 */
export interface CognitiveLoadBreakdown {
    workingMemoryLoad: number;
    informationLoad: number;
    decisionLoad: number;
    visualClutter: number;
    taskSwitchLoad: number;
    /** Weighted composite 0..100 — the Cognitive Load Index. */
    index: number;
}
export declare function estimateCognitiveLoad(percept: Percept, previousPercept: Percept | null, persona: Persona): CognitiveLoadBreakdown;
/** Running decision-fatigue accumulator: each hard choice depletes capacity. */
export declare class DecisionFatigue {
    private accumulated;
    /** Register a decision; harder decisions deplete more (ego depletion). */
    register(loadIndex: number): void;
    /** 0..1 fatigue from cumulative decision-making this session. */
    level(): number;
}
//# sourceMappingURL=cognitiveLoad.d.ts.map