/**
 * The conversational model — what a surface that answers back looks like.
 *
 * EVE's adapters have covered surfaces the operator *drives* and, since the
 * humanity seam, output they *read*. This is the third relationship: a
 * surface that **replies**. A support bot. An LLM copilot. A voice
 * assistant. The "ask me anything" box that has quietly become the front
 * door of a lot of products.
 *
 * It is not a document delivered in pieces, and modelling it as one loses
 * everything that matters. A dialogue has no back button, so a
 * misunderstanding cannot be undone — only talked past. The operator waits
 * without knowing whether anything is happening. And it is the only surface
 * that can fail to understand *them*, which puts a decision in front of the
 * operator no other modality does: rephrase, or give up?
 *
 * The perception boundary holds exactly as elsewhere. The operator perceives
 * what the surface says and what it offers alongside — suggested replies, a
 * handoff to a human, a citation. Not its prompt, not its confidence
 * scores, not its intent classification. A user of a support bot cannot see
 * those either.
 */
import type { ConversationTurn, Speaker } from "../core/kernel.js";
export type { ConversationTurn, Speaker };
/**
 * What kind of thing the operator is talking to. Like `ArtifactGenre` in the
 * humanity seam, this is the load-bearing field: it sets what the operator
 * expects, and therefore what counts as a failure.
 */
export type ConversationKind = 
/** A support bot with a task to complete: refund, reset, book, cancel. */
"support"
/** An open-ended assistant: explain, draft, summarize, decide. */
 | "assistant"
/** An in-product copilot that acts on the product on the operator's behalf. */
 | "copilot"
/** A scripted flow — menus, buttons, decision trees, IVR. */
 | "scripted";
/**
 * A turn plus how the surface classified itself.
 *
 * The analysis must not re-derive this from the text: a backend that *told*
 * us it did not understand (a scripted bot's fallback intent, an API
 * returning a no-match flag) is a surface admitting the miss, and reading
 * the wording instead reclassifies that admission as a silent near-miss —
 * the opposite verdict, and the one that punishes honesty.
 */
export interface ClassifiedTurn extends ConversationTurn {
    readonly notUnderstood: boolean;
    readonly refused: boolean;
    readonly handoff: boolean;
}
/** One thing the operator can act on beside typing: a chip, a handoff, a card. */
export interface ConversationAffordance {
    readonly id: string;
    /** `suggestion` (a canned reply), `handoff` (reach a human), `action`. */
    readonly kind: "suggestion" | "handoff" | "action";
    readonly label: string;
}
/** What the surface said back, and what it said it with. */
export interface ConversationReply {
    readonly text: string;
    /**
     * The surface signalled it did not understand — a fallback intent, "sorry,
     * I didn't catch that", "could you rephrase". Backends set this when the
     * surface says so explicitly; {@link detectNonAnswer} infers it otherwise.
     */
    readonly notUnderstood?: boolean;
    /** The surface declined: out of scope, not permitted, "I can't help with that". */
    readonly refused?: boolean;
    /** Things offered beside the text. */
    readonly affordances?: readonly ConversationAffordance[];
    /** How long the operator waited, in ms. Backends that know should say. */
    readonly latencyMs?: number;
    /** The surface ended the conversation (session closed, handed off, timed out). */
    readonly ended?: boolean;
}
/**
 * A conversational surface EVE can talk to.
 *
 * Deliberately one method. Everything a dialogue *is* — turn history, repair
 * counting, what the operator still recalls — belongs to the adapter and the
 * kernel, not to the transport. A backend's whole job is: given what the
 * operator said, what comes back and how long did it take.
 */
export interface ConversationBackend {
    readonly name: string;
    /** What the operator is talking to, when the backend knows. */
    readonly kind?: ConversationKind;
    /** Open the conversation. Returns a greeting, when the surface opens with one. */
    open?(): Promise<ConversationReply | null>;
    /** Say something; get what comes back. */
    send(message: string): Promise<ConversationReply>;
    close?(): Promise<void>;
}
/**
 * Read a reply the way the operator does: did it not understand me, or is it
 * declining? These are different experiences — a person rephrases for the
 * first and looks for another route for the second — so the model keeps them
 * apart rather than collapsing both into "the bot failed".
 */
export declare function detectNonAnswer(text: string): {
    notUnderstood: boolean;
    refused: boolean;
};
/** True when the reply offers a route to a person. */
export declare function offersHandoff(reply: ConversationReply): boolean;
/** Words in a turn, counted the way a listener consumes them. */
export declare function turnWordCount(text: string): number;
//# sourceMappingURL=types.d.ts.map