/**
 * The HTTP backend — a real chat endpoint.
 *
 * Chat APIs have not converged on a shape, so this deliberately does not
 * pretend they have: it posts a body built from a template and reads the
 * reply out of the response by path. Two shapes are pre-declared because
 * between them they cover most of what people actually deploy — an
 * OpenAI-style `choices[0].message.content` and a plain `{reply}` — and
 * anything else is a `replyPath` away.
 *
 * Latency here is *measured*, not modelled: this is one of the few places
 * EVE gets to observe a real duration rather than simulate one, and how long
 * a bot takes to answer is a large part of how it feels.
 */
import type { ConversationBackend, ConversationKind, ConversationReply } from "../types.js";
export interface HttpBackendOptions {
    readonly url: string;
    readonly method?: "POST" | "GET";
    readonly headers?: Readonly<Record<string, string>>;
    /**
     * Body template. `{{message}}` is replaced with what the operator said,
     * JSON-escaped. Defaults to `{"message": "{{message}}"}`.
     */
    readonly bodyTemplate?: string;
    /**
     * Dotted path to the reply text in the response, e.g.
     * `choices.0.message.content`. Defaults to trying the common shapes.
     */
    readonly replyPath?: string;
    readonly kind?: ConversationKind;
    readonly timeoutMs?: number;
    /** Inject a fetch implementation (tests, proxies). */
    readonly fetchImpl?: typeof fetch;
}
export declare class HttpBackend implements ConversationBackend {
    private readonly options;
    readonly name = "http";
    readonly kind: ConversationKind;
    private readonly fetchImpl;
    constructor(options: HttpBackendOptions);
    send(message: string): Promise<ConversationReply>;
}
/** Pull the reply text out of whatever shape the endpoint returned. */
export declare function extractReply(raw: string, replyPath?: string): string;
//# sourceMappingURL=http.d.ts.map