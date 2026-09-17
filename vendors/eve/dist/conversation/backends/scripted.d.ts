/**
 * The scripted backend — a conversational surface written down.
 *
 * Two jobs. It is how the test suite gets a deterministic interlocutor, and
 * it is how `eve chat mock:` demonstrates the seam with no network and no
 * API key, the same way `eve run mock:` demonstrates the browser one.
 *
 * A script is a list of rules matched against what the operator says. That
 * is not a toy: it is exactly what a scripted-flow bot *is*, so this backend
 * models one class of real surface honestly rather than only standing in for
 * the others. The `fallback` is the surface's fallback intent — the reply a
 * real bot gives when nothing matched — and modelling it as a first-class
 * field is what lets EVE experience the thing that actually goes wrong.
 */
import type { ConversationBackend, ConversationKind, ConversationReply } from "../types.js";
export interface ScriptRule {
    /** Matched against the operator's message, case-insensitively. */
    readonly when: RegExp | string;
    readonly reply: string;
    /** Simulated thinking time, in ms — what the operator waits through. */
    readonly latencyMs?: number;
    readonly refused?: boolean;
    readonly ended?: boolean;
    readonly affordances?: ConversationReply["affordances"];
    /** Fire this rule at most once; afterwards fall through to the next match. */
    readonly once?: boolean;
}
export interface Script {
    readonly name: string;
    readonly kind?: ConversationKind;
    /** What the surface says before the operator says anything. */
    readonly greeting?: string;
    readonly rules: readonly ScriptRule[];
    /** What the surface says when nothing matches — its fallback intent. */
    readonly fallback: string;
    /** ms of thinking time when a rule does not specify its own. */
    readonly latencyMs?: number;
}
export declare class ScriptedBackend implements ConversationBackend {
    private readonly script;
    readonly name: string;
    readonly kind: ConversationKind;
    private readonly used;
    constructor(script: Script);
    open(): Promise<ConversationReply | null>;
    send(message: string): Promise<ConversationReply>;
}
/**
 * The built-in demo bot, reachable as `eve chat mock:`.
 *
 * Deliberately a *plausible* support bot rather than a bad one: it greets
 * well, handles its happy path, and is confidently unhelpful everywhere
 * else. It never says it did not understand — it answers a nearby question
 * instead, which is the failure real users describe as "it kept talking past
 * me". Running EVE against it should produce findings that look familiar to
 * anyone who has used one of these.
 */
export declare const DEMO_SUPPORT_BOT: Script;
//# sourceMappingURL=scripted.d.ts.map