/**
 * The dialogue seam — EVE has a conversation.
 *
 * The browser adapters put the operator in front of software they drive; the
 * humanity seam put a reader in front of output they receive. This is the
 * third relationship: a surface that **answers back** — a support bot, an
 * LLM copilot, a voice assistant, the "ask me anything" box that has quietly
 * become the front door of a lot of products.
 *
 * See `docs/conversational-adapter.md`.
 */
export { ConversationAdapter } from "./adapter.js";
export { analyzeConversation } from "./analysis.js";
export { extractReply, HttpBackend } from "./backends/http.js";
export { DEMO_SUPPORT_BOT, ScriptedBackend } from "./backends/scripted.js";
export { converse } from "./converse.js";
export { ConversationPlugin } from "./plugin.js";
export { renderConversationMarkdown } from "./report.js";
export { detectNonAnswer, offersHandoff, turnWordCount } from "./types.js";
export { CONVERSATION_DIMENSIONS, registerConversationVocabulary, } from "./vocabulary.js";
//# sourceMappingURL=index.js.map