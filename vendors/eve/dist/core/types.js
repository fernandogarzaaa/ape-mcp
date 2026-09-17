/**
 * Core domain types shared across every EVE module.
 *
 * The guiding constraint of the whole system: the simulated operator may only
 * ever act on information a human could perceive through a screen. Types in
 * this file model that boundary explicitly — a {@link Percept} contains only
 * human-visible information (pixels, visible text, layout geometry, the URL
 * bar, loading indicators), never DOM internals, network traffic, console
 * output or source code.
 *
 * **Phase 2 note (modality-variant kernel):** {@link Percept} and the eleven
 * browser-flavored {@link Action} kinds are the *deprecated web view* of the
 * modality-agnostic kernel in `src/core/kernel.ts` (`KernelPercept`,
 * `Affordance`, `SurfaceSignal`, `KernelAction`). They remain the session
 * contract and are fully supported — existing adapters and consumers keep
 * working unchanged — but new surface vocabulary (new verbs, new signal
 * types, new affordance kinds) is added to the kernel, not to these shapes.
 */
export function describeAction(action) {
    switch (action.kind) {
        case "click":
            return `click "${label(action.target)}"`;
        case "doubleClick":
            return `double-click "${label(action.target)}"`;
        case "hover":
            return `hover over "${label(action.target)}"`;
        case "type":
            return `type "${action.text}" into "${label(action.target)}"`;
        case "press":
            return `press ${action.key}`;
        case "scroll":
            return action.deltaY >= 0 ? "scroll down" : "scroll up";
        case "navigate":
            return `navigate to ${action.url}`;
        case "back":
            return "go back";
        case "read":
            return action.target ? `read "${label(action.target)}"` : "read the screen";
        case "wait":
            return `wait ${Math.round(action.durationMs)}ms`;
        case "abandon":
            return `give up: ${action.reason}`;
        case "invoke":
            return describeInvoke(action.verb, action.payload);
    }
}
/**
 * Describe a kernel-native action by what it is. An MCP tool call reads as
 * `invoke add({"a":2})` — the evidence chain names the tool and its typed
 * arguments rather than "type 2 into a" (projection debt ledger item 1).
 */
function describeInvoke(verb, payload) {
    if (verb === "mcp.invoke" && isToolInvocation(payload)) {
        return `invoke ${payload.tool}(${JSON.stringify(payload.arguments ?? {})})`;
    }
    const suffix = payload === undefined ? "" : ` ${JSON.stringify(payload)}`;
    return `${verb}${suffix}`;
}
function isToolInvocation(payload) {
    return (typeof payload === "object" &&
        payload !== null &&
        typeof payload.tool === "string");
}
function label(el) {
    const text = el.text.trim().replace(/\s+/g, " ");
    return text.length > 48 ? `${text.slice(0, 45)}...` : text || `${el.role}#${el.id}`;
}
/**
 * The built-in finding categories, pre-registered in
 * `findingCategoryRegistry` (`src/core/findingCategories.ts`). The registry
 * is the source of truth at runtime; this tuple pins the serialized values
 * the type-level union is derived from, so existing `FindingCategory` types
 * and stored reports are unaffected.
 */
export const FINDING_CATEGORIES = [
    "usability",
    "navigation",
    "visual",
    "accessibility",
    "performance",
    "content",
    "error-recovery",
    "expectation-violation",
    "workflow",
    "consistency",
];
/**
 * The built-in score dimensions, pre-registered in `dimensionRegistry`
 * (`src/scoring/dimensions.ts`). The registry is the runtime source of
 * truth; this tuple pins the serialized values the type-level union is
 * derived from, so existing `ScoreDimension` types and stored reports are
 * unaffected.
 */
export const SCORE_DIMENSIONS = [
    "overall",
    "usability",
    "learnability",
    "accessibility",
    "efficiency",
    "consistency",
    "visualDesign",
    "navigation",
    "workflowQuality",
    "informationArchitecture",
    "onboarding",
    "errorRecovery",
    "responsiveness",
    "userConfidence",
    "cognitiveLoad",
    "trust",
];
//# sourceMappingURL=types.js.map