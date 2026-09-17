/**
 * The eleven legacy browser action kinds — the default verb vocabulary of
 * every surface that predates the kernel (web, mobile, CLI, mock).
 */
export const LEGACY_WEB_VERBS = [
    "click",
    "doubleClick",
    "hover",
    "type",
    "press",
    "scroll",
    "navigate",
    "back",
    "read",
    "wait",
    "abandon",
];
/** The verbs a surface actuates natively (declared, or the legacy web set). */
export function actionVerbsFor(capabilities) {
    return capabilities.actionVerbs ?? LEGACY_WEB_VERBS;
}
/** A rendered browser page: full pixel geometry and styling, driven by a mouse. */
export const VISUAL_SURFACE = {
    spatial: true,
    modality: "visual",
    canScreenshot: true,
    canGoBack: true,
    canScroll: true,
    pointer: "mouse",
    canHover: true,
};
/**
 * A text surface (terminal, tool listing). Character-cell geometry is real,
 * but there is no font size, color, or screenshot to perceive. Pointer/hover
 * are not meaningful here (no rendered surface to point at); "mouse"/false
 * are inert defaults, mirroring how `spatial: false` makes `canScreenshot`
 * moot rather than describing a real capability.
 */
export const TEXTUAL_SURFACE = {
    spatial: false,
    modality: "textual",
    canScreenshot: false,
    canGoBack: false,
    canScroll: true,
    pointer: "mouse",
    canHover: false,
};
/**
 * A rendered mobile page: full pixel geometry and styling, but actuated by
 * touch. There is no persistent pointer, so hover-revealed content is
 * genuinely unreachable — not merely awkward to reach.
 */
export const TOUCH_VISUAL_SURFACE = {
    spatial: true,
    modality: "visual",
    canScreenshot: true,
    canGoBack: true,
    canScroll: true,
    pointer: "touch",
    canHover: false,
};
/**
 * A document surface (`src/humanity/`): a digital output the operator reads
 * rather than operates — a report, a deck, an analytics export, a terminal
 * transcript.
 *
 * Reading order is its geometry, so pixel geometry and visual styling are
 * not meaningful (`spatial: false`) and there is nothing to screenshot. The
 * reader *can* go back — turning back a page is a real, everyday act, unlike
 * a terminal's absent back button — and moves through content, which the
 * legacy `canScroll` names. Pointer and hover are inert defaults for the
 * same reason they are on a textual surface: there is no rendered surface to
 * point at.
 */
export const DOCUMENT_SURFACE = {
    spatial: false,
    modality: "document",
    canScreenshot: false,
    canGoBack: true,
    canScroll: true,
    pointer: "mouse",
    canHover: false,
};
/**
 * The verbs a reader actuates on a document surface. Reading is not clicking:
 * a reader skims, reads closely, turns pages, goes back for a re-read,
 * follows a cross-reference, and studies a table or a figure.
 */
export const DOCUMENT_VERBS = [
    "doc.skim",
    "doc.read",
    "doc.study",
    "doc.next",
    "doc.back",
    "doc.reread",
    "doc.follow",
    "read",
    "wait",
];
/**
 * A conversational surface (`src/conversation/`): something that answers
 * back — a support bot, an LLM copilot, a voice assistant.
 *
 * Turn order is its geometry, so there is no pixel layout, nothing to
 * screenshot, and no pointer. `canGoBack` is false for a reason worth
 * stating: a dialogue has no back button, and that is exactly why a
 * misunderstanding is expensive — the only way out is forward, by saying
 * something else. `canScroll` is true because scrollback is real: the
 * operator can look at what was said earlier, up to what they still recall.
 */
export const CONVERSATIONAL_SURFACE = {
    spatial: false,
    modality: "conversational",
    canScreenshot: false,
    canGoBack: false,
    canScroll: true,
    pointer: "mouse",
    canHover: false,
};
/**
 * The verbs an operator actuates in a dialogue. Talking is not clicking:
 * you open, you follow up, you rephrase the thing that did not land, you
 * answer the question you were asked back, and when none of it works you
 * ask for a human.
 */
export const CONVERSATION_VERBS = [
    "chat.say",
    "chat.followup",
    "chat.rephrase",
    "chat.clarify",
    "chat.escalate",
    "read",
    "wait",
];
//# sourceMappingURL=capabilities.js.map