/**
 * `converse` — the one call that talks to something like a human would.
 *
 * Wires the pieces the way `eve run` wires a browser session and `eve read`
 * wires a reading one: a conversation adapter over a backend, the session
 * loop for the moment-to-moment experience, and the conversation plugin for
 * the judgment formed across the whole transcript. What comes back is an
 * ordinary `SessionResult` — scored, evidence-backed, renderable by every
 * existing report — with the transcript and the analysis alongside.
 *
 * Getting an answer is modelled as success: the operator's goal signals are
 * matched against what the surface actually said, so a conversation that
 * resolved ends `goal-achieved` and one the person walked away from ends
 * `abandoned`. That distinction is the whole point of measuring a bot.
 */
import type { ConversationTurn } from "../core/kernel.js";
import { type SessionOptions, type SessionResult } from "../engine/session.js";
import type { Persona } from "../personas/persona.js";
import type { EvePlugin } from "../plugins/plugin.js";
import { type ConversationAnalysis } from "./analysis.js";
import type { ConversationBackend, ConversationKind } from "./types.js";
export interface ConverseOptions extends Omit<Partial<SessionOptions>, "adapter" | "startUrl" | "persona"> {
    readonly persona?: Persona | string;
    /** What the operator is talking to; overrides what the backend reports. */
    readonly kind?: ConversationKind;
    /** Operator-visible address for reports. */
    readonly address?: string;
    readonly plugins?: readonly EvePlugin[];
}
export interface ConversationResult extends SessionResult {
    readonly transcript: readonly ConversationTurn[];
    readonly conversation: ConversationAnalysis;
}
/**
 * Have a conversation with a backend and report the experience.
 *
 * `goal` is what the operator came for — it becomes their opening line, so
 * it should read the way a person would say it ("get a refund for a double
 * charge"), not the way a test case would.
 */
export declare function converse(backend: ConversationBackend, options?: ConverseOptions): Promise<ConversationResult>;
//# sourceMappingURL=converse.d.ts.map