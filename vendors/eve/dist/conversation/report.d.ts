/**
 * Conversation reports.
 *
 * The session's own HTML/Markdown/JSON reports already render a conversation
 * — findings, scores, the journal — because a conversation is an ordinary
 * session. What they cannot show is the thing specific to dialogue: the
 * transcript, marked up with where it went wrong.
 */
import type { ConversationTurn } from "../core/kernel.js";
import type { ConversationAnalysis } from "./analysis.js";
/**
 * Render the conversation as Markdown: the verdict, then the transcript with
 * the failures marked where they happened.
 *
 * The transcript is the report. A score tells someone their bot is bad; the
 * exchange where a person asked three times and left tells them why, and is
 * the thing that actually gets forwarded to whoever can fix it.
 */
export declare function renderConversationMarkdown(analysis: ConversationAnalysis, turns: readonly ConversationTurn[]): string;
//# sourceMappingURL=report.d.ts.map