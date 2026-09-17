import type { CognitiveContext, Decision, DecisionPolicy, FallbackReportingPolicy } from "./cognition.js";
/**
 * Optional LLM-backed decision policy, powered by the Anthropic API.
 *
 * The LLM plays the persona: it receives only what the operator could see
 * (the percept, rendered as text) plus the operator's own internal state
 * (goal, emotions, memory highlights) — never privileged application data —
 * and returns one structured decision per loop iteration.
 *
 * `@anthropic-ai/sdk` is an optional peer dependency, imported dynamically.
 * If it is missing, or a call fails, the policy degrades gracefully to the
 * built-in heuristic policy so a simulation never dies mid-run.
 */
export interface LlmCognitionOptions {
    /** Anthropic model id. */
    model?: string;
    /** API key; defaults to the SDK's environment resolution. */
    apiKey?: string;
    maxTokens?: number;
    /**
     * Per-request timeout passed to the Anthropic client, in ms. Without this,
     * a hung call can ride the SDK's own ~10-minute default (times retries),
     * and because the session's wall-clock budget is only checked between loop
     * iterations, one hung call can blow through the whole session's budget.
     */
    timeoutMs?: number;
}
export declare class LlmCognition implements DecisionPolicy, FallbackReportingPolicy {
    readonly name = "llm";
    private readonly fallback;
    private client;
    private clientLoadFailed;
    private readonly model;
    private readonly apiKey;
    private readonly maxTokens;
    private readonly timeoutMs;
    private pendingFallbackReason;
    constructor(options?: LlmCognitionOptions);
    /** Consumed on read — see {@link FallbackReportingPolicy}. */
    takeFallbackReason(): string | null;
    private fallbackTo;
    decide(ctx: CognitiveContext): Promise<Decision>;
    private getClient;
    private systemPrompt;
    private scenePrompt;
    private toDecision;
}
//# sourceMappingURL=llmCognition.d.ts.map