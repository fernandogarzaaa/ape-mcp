/**
 * Product intelligence — infer *product* insight from a population study, not
 * just UX findings. Given how a population actually moved through an app, this
 * reconstructs the personas it reveals, the workflows people traverse, the
 * business goals those workflows serve, which features matter, where friction
 * concentrates, and what causes drop-off.
 *
 * Everything is derived deterministically from observed behaviour (operator
 * paths, segments, the navigation heatmap, and prevalence-ranked findings) — no
 * app source is inspected, preserving EVE's human-perception boundary.
 */
import type { PopulationStudy } from "../population/population.js";
export interface InferredPersona {
    readonly archetype: string;
    readonly segmentKey: string;
    readonly share: number;
    readonly size: number;
    readonly successRate: number;
    readonly typicalPersona: string;
    readonly description: string;
}
export interface BusinessGoal {
    readonly goal: string;
    readonly trafficShare: number;
    readonly screens: readonly string[];
    readonly evidence: string;
}
export interface Workflow {
    readonly label: string;
    readonly sequence: readonly string[];
    readonly traversals: number;
}
export interface FeatureImportance {
    readonly feature: string;
    readonly reach: number;
    readonly visits: number;
    readonly importance: number;
    readonly onCriticalPath: boolean;
}
export interface FrictionPage {
    readonly screen: string;
    readonly frictionScore: number;
    readonly dropoffs: number;
    readonly revisitRatio: number;
    readonly reasons: readonly string[];
}
export interface DropoffCause {
    readonly screen: string;
    readonly operators: number;
    readonly share: number;
    readonly likelyCause: string;
}
export interface ProductIntelligence {
    /** The study's target URL (identity — unchanged by display labels). */
    readonly url: string;
    /** Human-facing target name for report headers. Optional — renderers fall
     * back to `url`, so pre-existing consumers/constructors are unaffected. */
    readonly label?: string;
    readonly size: number;
    readonly personas: readonly InferredPersona[];
    readonly businessGoals: readonly BusinessGoal[];
    readonly criticalWorkflows: readonly Workflow[];
    readonly featureImportance: readonly FeatureImportance[];
    readonly highFrictionPages: readonly FrictionPage[];
    readonly dropoffCauses: readonly DropoffCause[];
    readonly generatedAt: string;
}
/**
 * Infer product intelligence from a population study.
 */
export declare function inferProductIntelligence(study: PopulationStudy): ProductIntelligence;
//# sourceMappingURL=intelligence.d.ts.map