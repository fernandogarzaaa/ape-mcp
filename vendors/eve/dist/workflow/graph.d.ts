import type { Percept } from "../core/types.js";
import type { WorkflowKind } from "./catalog.js";
/**
 * The discovered workflow map of the product: which workflow-classified
 * screens exist and how the operator moved between them. Built passively
 * while the operator explores; consumed by scoring and reporting.
 */
export interface WorkflowNode {
    readonly signature: string;
    url: string;
    title: string;
    kind: WorkflowKind;
    kindConfidence: number;
    visits: number;
    /** Steps at which the operator perceived an error on this screen. */
    errorSteps: number[];
    firstSeenStep: number;
}
export interface WorkflowTransition {
    readonly from: string;
    readonly to: string;
    readonly via: string;
    count: number;
}
export interface DiscoveredWorkflow {
    readonly kind: WorkflowKind;
    readonly screens: readonly WorkflowNode[];
    /** Did the operator reach a confirmation/terminal screen for it? */
    readonly completed: boolean;
    readonly errorCount: number;
}
export declare class WorkflowGraph {
    private readonly nodes;
    private readonly transitions;
    private lastSignature;
    observe(percept: Percept, step: number, arrivedVia: string | null, errorPerceived: boolean): WorkflowNode;
    allNodes(): readonly WorkflowNode[];
    allTransitions(): readonly WorkflowTransition[];
    /**
     * Group discovered screens into workflows and judge completion: a workflow
     * counts as completed when the operator both entered it and subsequently
     * reached a confirmation-like screen or returned to a dashboard.
     */
    discoveredWorkflows(): readonly DiscoveredWorkflow[];
    /** Fraction of discovered screens revisited more than twice (wandering). */
    revisitRatio(): number;
}
//# sourceMappingURL=graph.d.ts.map