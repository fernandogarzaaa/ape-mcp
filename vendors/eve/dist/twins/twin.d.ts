/**
 * Digital-twin lifecycle: create a twin, derive its (evolved) persona, run a
 * session that both uses and updates its memory, and evolve its profile from
 * the outcome.
 */
import type { BrowserAdapter } from "../browser/index.js";
import { type SessionResult } from "../engine/session.js";
import { type Persona } from "../personas/index.js";
import type { TwinEvolution, TwinProfile, TwinSessionOutcome } from "./types.js";
export interface CreateTwinSpec {
    readonly id: string;
    readonly name: string;
    readonly basePersona: string;
    readonly profession?: string;
    readonly culture?: string;
}
/** Create a fresh twin, seeding its confidence baseline from the base persona. */
export declare function createTwin(spec: CreateTwinSpec): TwinProfile;
/** Derive the twin's current persona, reflecting its evolved confidence. */
export declare function twinPersona(twin: TwinProfile): Persona;
/** Evolve a twin's profile from a session outcome (pure). */
export declare function evolveTwin(evolution: TwinEvolution, outcome: TwinSessionOutcome): TwinEvolution;
export interface TwinSessionConfig {
    readonly adapter: BrowserAdapter;
    readonly url: string;
    readonly goal?: string;
    readonly goalSuccessSignals?: readonly string[];
    readonly seed?: number | string;
    readonly maxSteps?: number;
    readonly cognitive?: boolean;
}
export interface TwinSessionResult {
    readonly twin: TwinProfile;
    readonly result: SessionResult;
    readonly outcome: TwinSessionOutcome;
}
/**
 * Run one session as this twin: seed an in-memory store from the twin's learned
 * memories, run the session (which reads and updates that memory), then evolve
 * the twin and fold the updated memory back in. Returns the updated twin.
 */
export declare function runTwinSession(twin: TwinProfile, config: TwinSessionConfig): Promise<TwinSessionResult>;
//# sourceMappingURL=twin.d.ts.map