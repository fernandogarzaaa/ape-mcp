import type { BrowserAdapter } from "../browser/adapter.js";
import { type SessionResult } from "../engine/session.js";
import type { Persona } from "../personas/persona.js";
import type { EvePlugin } from "../plugins/plugin.js";
/**
 * Collaborative sessions.
 *
 * Real work is rarely solo: a form is filled by one person and approved by
 * another; a document passes through a chain of roles; a task is handed off
 * mid-flow. This orchestrator runs a sequence of operators against the same
 * application, modeling handoffs and approval chains. Operators optionally
 * share long-term memory (institutional knowledge transfer) and each receives
 * a "baton" describing what the previous operator accomplished — so a
 * downstream role acts with awareness of upstream work.
 *
 * Permission boundaries are expressed as per-role goals and start points; the
 * orchestrator records where handoffs succeeded or broke down.
 */
export interface CollaborativeRole {
    readonly name: string;
    readonly persona: Persona | string;
    readonly goal: string;
    readonly goalSuccessSignals?: readonly string[];
    /** Where this role begins; defaults to where the previous role ended. */
    readonly startUrl?: string;
    /** Max steps for this role. */
    readonly maxSteps?: number;
    readonly plugins?: readonly EvePlugin[];
}
export interface CollaborativeScenario {
    readonly name: string;
    /** Factory so each role gets a fresh adapter over the same underlying app. */
    readonly adapterFactory: () => BrowserAdapter;
    readonly startUrl: string;
    readonly roles: readonly CollaborativeRole[];
    /** Share long-term memory across roles (knowledge transfer). Default true. */
    readonly sharedMemory?: boolean;
    readonly seed?: number | string;
    readonly cognitive?: boolean;
}
export interface Handoff {
    readonly from: string;
    readonly to: string;
    /** Did the upstream role complete its goal before handing off? */
    readonly upstreamCompleted: boolean;
    /** The screen the baton was passed at. */
    readonly atUrl: string;
    readonly note: string;
}
export interface CollaborativeResult {
    readonly scenario: string;
    readonly roleResults: Array<{
        role: string;
        result: SessionResult;
    }>;
    readonly handoffs: readonly Handoff[];
    /** Did the whole chain complete (every role achieved its goal)? */
    readonly chainCompleted: boolean;
    /** Where the chain first broke down, if it did. */
    readonly breakdown: {
        role: string;
        reason: string;
    } | null;
    readonly summary: string;
}
/**
 * Run a collaborative scenario end-to-end.
 */
export declare function runCollaborative(scenario: CollaborativeScenario): Promise<CollaborativeResult>;
//# sourceMappingURL=collaborative.d.ts.map