/**
 * ConversationAdapter — EVE has a conversation.
 *
 * The browser adapters put the operator in front of software they drive; the
 * humanity adapter put a reader in front of output they receive. This one
 * puts a person in front of something that **answers back**, which is a
 * different relationship again and fails in its own way.
 *
 * **Kernel-native.** The source of truth is the conversational kernel
 * (`src/core/kernel.ts`): turn order as geometry, a `not-understood` signal
 * for the one failure only a dialogue has, and a repair count — because how
 * many times a person has already rephrased is the single best predictor of
 * whether they are about to leave. The legacy browser-flavored snapshot is
 * derived from the same state, so scoring, workflows, reports and the
 * session loop all work on a conversation unchanged.
 *
 * | Kernel concept    | Conversation                       | Deprecated web view    |
 * | ----------------- | ---------------------------------- | ---------------------- |
 * | frame identity    | the surface's address + name       | `url` / `title`        |
 * | affordances       | suggested replies, handoff         | buttons and links      |
 * | turn order        | `turns[]`, oldest first            | transcript lines       |
 * | it misunderstood  | `not-understood` signal            | a fake modal "dialog"  |
 * | it is composing   | `awaitingReply`                    | a loading indicator    |
 * | latency           | `lastLatencyMs`, measured          | (lost)                 |
 *
 * The perception boundary is unchanged: the operator perceives what the
 * surface says and what it offers alongside. Not its prompt, not its
 * confidence, not its intent classifier — a user of a support bot sees none
 * of those either.
 */
import type { BrowserAdapter, KernelSurface, RawSnapshot } from "../browser/adapter.js";
import type { ConversationalKernelPercept, KernelAction } from "../core/kernel.js";
import type { Point, Viewport } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
import type { ClassifiedTurn, ConversationBackend, ConversationKind } from "./types.js";
export interface ConversationAdapterOptions {
    readonly backend: ConversationBackend;
    /**
     * The person doing the talking. How many times they will rephrase before
     * giving up is a property of them, not of the bot, so the adapter needs it
     * to report what this operator actually experienced.
     */
    readonly persona?: Persona;
    /** What the operator is talking to; overrides the backend's own answer. */
    readonly kind?: ConversationKind;
    /** Operator-visible address, e.g. `chat:https://…` or `chat:mock:`. */
    readonly address?: string;
}
export declare class ConversationAdapter implements BrowserAdapter, KernelSurface {
    private readonly options;
    readonly name = "conversation";
    readonly capabilities: {
        spatial: boolean;
        modality: import("../core/registry.js").Modality;
        canScreenshot: boolean;
        canGoBack: boolean;
        canScroll: boolean;
        pointer: "mouse" | "touch";
        canHover: boolean;
        actionVerbs: readonly ["chat.say", "chat.followup", "chat.rephrase", "chat.clarify", "chat.escalate", "read", "wait"];
    };
    private readonly backend;
    private persona;
    private address;
    private turns;
    private openedAt;
    private awaitingReply;
    private lastLatencyMs;
    private repairAttempts;
    private ended;
    /** What the operator said last, so a rephrase can be recognized as one. */
    private lastOperatorMessage;
    /**
     * Latency accumulated since the session last asked. Drained on read so a
     * single wait is never charged to the operator twice.
     */
    private unreportedWaitMs;
    private opened;
    constructor(options: ConversationAdapterOptions);
    /** The kind of thing being talked to — sets what the operator expects. */
    get kind(): ConversationKind;
    /** The full transcript, for the analysis and the reports. */
    transcript(): readonly ClassifiedTurn[];
    /** How many times the operator had to say the same thing again. */
    repairs(): number;
    attachOperator(persona: Persona): void;
    /**
     * How long the operator waited for replies since this was last called.
     *
     * A conversational surface is one of the few EVE drives where latency is
     * genuinely *measured* rather than modeled — the backend took as long as
     * it took — and waiting is most of what makes a slow bot unbearable.
     */
    lastWaitMs(): number;
    open(url: string, _viewport: Viewport): Promise<void>;
    kernelPercept(): Promise<ConversationalKernelPercept>;
    /**
     * What the operator can act on besides typing: the chips the surface
     * offered, and the way out to a person when it named one.
     *
     * Only the most recent surface turn contributes. A suggested reply from
     * four turns ago is gone from the interface, and offering it back would be
     * inventing an affordance the operator cannot see.
     */
    private affordances;
    actKernel(action: KernelAction): Promise<void>;
    /** Say something and record what comes back. */
    private say;
    private recordReply;
    /**
     * True when the surface answered without admitting it missed — the reply
     * shares almost no vocabulary with what was asked.
     *
     * Deliberately conservative. A short reply ("Sure!", "Done.") is not
     * evidence of anything, and neither is a reply that reuses the operator's
     * own words. What this catches is the case people actually complain
     * about: a fluent, confident paragraph about a nearby topic.
     */
    private answeredSomethingElse;
    /** How much of the conversation the operator still has in mind. */
    private recallWindow;
    snapshot(): Promise<RawSnapshot>;
    screenshot(): Promise<Buffer | null>;
    moveMouse(_point: Point): Promise<void>;
    /** Clicking a suggested reply is saying it — which is what a chip is. */
    clickAt(point: Point): Promise<void>;
    doubleClickAt(point: Point): Promise<void>;
    /**
     * The legacy typing path. Text is buffered rather than sent, because a
     * person composes a whole message before pressing Enter — sending each
     * keystroke would be a different (and much worse) product.
     */
    private composing;
    typeText(text: string, _perCharIntervalMs: number): Promise<void>;
    pressKey(key: string): Promise<void>;
    scrollBy(_deltaY: number): Promise<void>;
    goBack(): Promise<void>;
    navigate(url: string): Promise<void>;
    close(): Promise<void>;
    private requireOpen;
}
//# sourceMappingURL=adapter.d.ts.map