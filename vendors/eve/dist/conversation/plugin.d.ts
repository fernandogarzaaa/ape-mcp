/**
 * ConversationPlugin — the judgment the person forms about the thing they
 * were talking to.
 *
 * Runs at session end, once, over the whole transcript rather than per
 * percept, because most of what matters is only visible across turns: a
 * surface asked twice for the same thing, never once admitted a miss, never
 * offered a person. You cannot see any of that from a single reply.
 *
 * Findings land through the ordinary plugin channel, so they are
 * deduplicated, scored into the `conversation.*` dimensions, and rendered in
 * every report exactly like an accessibility or performance finding.
 */
import type { EvePlugin, PluginContext } from "../plugins/plugin.js";
import type { ConversationAdapter } from "./adapter.js";
import { type ConversationAnalysis } from "./analysis.js";
export interface ConversationPluginOptions {
    readonly goal?: string;
}
export declare class ConversationPlugin implements EvePlugin {
    private readonly adapter;
    private readonly options;
    readonly name = "conversation";
    private analysis;
    constructor(adapter: ConversationAdapter, options?: ConversationPluginOptions);
    onRegister(): void;
    onSessionEnd(ctx: PluginContext): void;
    /** The analysis this plugin produced, once the session has ended. */
    result(): ConversationAnalysis | null;
}
//# sourceMappingURL=plugin.d.ts.map