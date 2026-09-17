/**
 * The conversation pack's vocabulary registration.
 *
 * Dialogue fails along axes none of the built-in dimensions name. "Usability"
 * does not describe a bot that answered a different question; "navigation"
 * does not describe one that forgot what it was told. So the pack registers
 * its own through the Phase-0 registries rather than by editing core, exactly
 * as the MCP and humanity packs do.
 *
 * All four are `appliesTo: ["conversational"]`: a page is not scored on
 * whether it offered a handoff, and a bot is not scored on tap-target size.
 * Registration is idempotent — the registries are process-global and reject
 * duplicates loudly.
 */
export declare const CONVERSATION_DIMENSIONS: readonly ["conversation.understanding", "conversation.grounding", "conversation.recovery", "conversation.responsiveness"];
export type ConversationDimension = (typeof CONVERSATION_DIMENSIONS)[number];
/** Register the conversation pack's dimensions, categories and verbs. */
export declare function registerConversationVocabulary(): void;
//# sourceMappingURL=vocabulary.d.ts.map