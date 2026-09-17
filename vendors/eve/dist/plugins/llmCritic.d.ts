import type { Percept } from "../core/types.js";
import type { EvePlugin, PluginContext } from "./plugin.js";
/**
 * LLM Critic plugin (optional): a design-review pass powered by the
 * Anthropic API. Once per unique screen it shows the model the screenshot
 * (when available) plus the visible text, and asks for expert UX critique in
 * a structured shape that maps directly onto findings.
 *
 * Requires the optional peer dependency `@anthropic-ai/sdk`; if unavailable
 * the plugin is silently inert.
 */
export interface LlmCriticOptions {
    model?: string;
    apiKey?: string;
    /** Max screens to critique per session (cost control). */
    maxScreens?: number;
    /**
     * Per-request timeout passed to the Anthropic client, in ms. Without this,
     * a hung call can ride the SDK's own ~10-minute default (times retries).
     */
    timeoutMs?: number;
}
export declare class LlmCriticPlugin implements EvePlugin {
    readonly name = "llm-critic";
    private client;
    private loadFailed;
    private clientFailureReason;
    private readonly critiqued;
    private readonly model;
    private readonly apiKey;
    private readonly maxScreens;
    private readonly timeoutMs;
    constructor(options?: LlmCriticOptions);
    onPercept(ctx: PluginContext, percept: Percept): Promise<void>;
    private getClient;
}
//# sourceMappingURL=llmCritic.d.ts.map