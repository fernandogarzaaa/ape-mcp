/**
 * Autonomous exploration → application map. Given only a URL, EVE explores an
 * app like a curious human and — from what it *perceived* (screens, their
 * visible affordances, and the transitions it took between them) — reconstructs
 * a complete map of the application: its screens and their inferred purpose,
 * the navigation graph, entry points, hubs, dead-ends, and the affordances it
 * never got to exercise (candidate hidden / edge functionality).
 *
 * It is built purely from perception (`Percept`s and the action journal), never
 * from app source — the human-perception boundary holds.
 */
import type { SessionResult } from "../engine/session.js";
export interface AppScreen {
    readonly id: string;
    readonly title: string;
    readonly purpose: string;
    readonly affordances: readonly string[];
    /** Interactive affordances never used as an outgoing transition. */
    readonly unexercised: readonly string[];
    readonly elementCount: number;
    readonly visits: number;
    readonly inDegree: number;
    readonly outDegree: number;
}
export interface MapTransition {
    readonly from: string;
    readonly to: string;
    readonly via: string;
    readonly count: number;
}
export interface ApplicationMap {
    readonly url: string;
    readonly screens: readonly AppScreen[];
    readonly transitions: readonly MapTransition[];
    readonly entryPoints: readonly string[];
    readonly hubs: readonly string[];
    readonly deadEnds: readonly string[];
    readonly coverage: {
        readonly screens: number;
        readonly transitions: number;
    };
    readonly generatedAt: string;
}
/**
 * Build an application map from one or more exploratory sessions (more
 * explorers = broader coverage). Each session's `capturedScreens` supply the
 * screens and affordances; its `iterations` supply the transitions.
 */
export declare function buildApplicationMap(sessions: readonly SessionResult[]): ApplicationMap;
//# sourceMappingURL=appmap.d.ts.map