/**
 * The modality-variant kernel (Phase 2, Approach B — the one-time core
 * generalization; see `docs/kernel.md` and `docs/projection-debt-ledger.md`).
 *
 * Everything downstream of the adapters actually consumes five things, and
 * they are all modality-agnostic:
 *
 * | Kernel concept     | Browser-flavored legacy form                          |
 * | ------------------ | ----------------------------------------------------- |
 * | frame identity     | `Percept.url` / `Percept.title`                       |
 * | affordances        | `VisibleElement[]` (ARIA-flavored role + pixel box)   |
 * | surface signals    | `dialogs` + `loadingIndicator` + scroll extent        |
 * | action vocabulary  | the closed 11-kind `Action` union                     |
 * | outcome            | next percept + prediction comparison (unchanged)    |
 *
 * The kernel names those five concepts directly: {@link KernelPercept} is a
 * discriminated union over modality; {@link Affordance.kind} is an open,
 * registry-aligned string (ARIA roles on the web, `mcp.tool` on MCP), not a
 * closed union; {@link SurfaceSignal} is typed, so a tool result, a protocol
 * error and a server notification are three different things rather than one
 * fake "dialog"; and {@link KernelAction.verb} comes from the per-surface
 * verb registry the adapter declares in `SurfaceCapabilities.actionVerbs`.
 *
 * The legacy `Percept`/`Action` shapes are NOT removed. They are the
 * deprecated **web view** of the kernel: `kernelFromWebPercept` projects a
 * legacy percept into the kernel, and `webPerceptFromKernel` projects a
 * kernel percept back. Adapters that predate the kernel (browser, CLI, mock)
 * keep shipping the legacy shape and are projected; kernel-native adapters
 * (MCP) ship the real thing and derive their legacy snapshot from it, so old
 * consumers keep working while the strain entries in the projection debt
 * ledger get first-class homes here.
 */
/* ------------------------------------------------------------------ */
/* The deprecated web view (compatibility shims)                       */
/* ------------------------------------------------------------------ */
/**
 * What the surface itself put in front of the operator, for evidence that
 * must not include the operator's own words.
 *
 * On every other modality this distinction does not exist — everything on
 * screen is the application's output. A dialogue is the exception: half the
 * transcript is the person typing, and a person typing "refund" is not
 * evidence that they got one. Goal-success signals matched against the whole
 * chat window therefore fire on the operator's own opening line, and report
 * a bot that never helped as having succeeded.
 */
export function surfaceAuthoredText(kernel) {
    if (kernel.modality !== "conversational") {
        return [kernel.frame.label, ...kernel.affordances.map((a) => a.description)].join(" \n ");
    }
    return kernel.turns
        .filter((turn) => turn.speaker === "surface")
        .map((turn) => turn.text)
        .join(" \n ");
}
/**
 * Project a legacy web {@link Percept} into the kernel. The mapping is
 * one-to-one on content (elements → affordances, dialogs/loading → signals,
 * url/title → frame identity); the returned kernel percept is what cognition
 * sees when the adapter predates the kernel, so kernel-aware consumers work
 * uniformly across old and new adapters.
 *
 * `modality` comes from the adapter's `SurfaceCapabilities`. For textual
 * legacy adapters (CLI) the projection is honest about its limits: the
 * kernel affordances and signals are complete, but the line buffer is empty
 * — a legacy `Percept` simply does not carry one.
 */
export function kernelFromWebPercept(percept, modality = "visual") {
    const affordances = percept.elements.map((el) => ({
        id: `el:${el.id}`,
        kind: el.role,
        locator: { kind: "bbox", box: el.box },
        description: el.text,
        state: {
            enabled: !el.disabled,
            editable: el.editable,
        },
    }));
    const signals = percept.dialogs.map((d) => ({ type: "dialog", text: d.text }));
    if (percept.loadingIndicator)
        signals.push({ type: "loading", active: true });
    const base = {
        timestamp: percept.timestamp,
        frame: { address: percept.url, label: percept.title },
        affordances,
        signals,
    };
    if (modality === "textual") {
        return {
            ...base,
            modality,
            // A legacy Percept carries no line buffer to project.
            lines: [],
            windowRows: 0,
            scrollLine: 0,
        };
    }
    if (modality === "conversational") {
        // A legacy Percept has no turn history to project: the best it can do is
        // present the whole screen as one thing the surface said.
        const text = percept.elements
            .map((el) => el.text.trim())
            .filter(Boolean)
            .join("\n");
        return {
            ...base,
            modality,
            turns: text ? [{ id: "t0", speaker: "surface", text }] : [],
            recallWindow: 1,
            awaitingReply: percept.loadingIndicator,
            lastLatencyMs: null,
            repairAttempts: 0,
        };
    }
    if (modality === "document") {
        // A legacy Percept has no reading order, so the projection is honest
        // about that: every visible element becomes one block of the single
        // section the web view can express.
        return {
            ...base,
            modality,
            blocks: percept.elements.map((el) => ({
                id: `el:${el.id}`,
                kind: el.role,
                text: el.text,
                depth: 0,
                section: 0,
            })),
            section: 0,
            sectionCount: 1,
            sectionNoun: "section",
            totalBlocks: percept.elements.length,
            blocksRead: 0,
        };
    }
    return {
        ...base,
        modality,
        viewport: percept.viewport,
        scrollY: percept.scrollY,
        scrollHeight: percept.scrollHeight,
        screenshot: percept.screenshot,
    };
}
/**
 * Project a kernel percept back into the deprecated web view.
 *
 * For visual kernel percepts this is the inverse of
 * {@link kernelFromWebPercept} (round-trip preserves identity/geometry).
 * Textual kernels need char-cell layout, which lives in the surface layer —
 * see `webPerceptFromKernel` in `src/surface/kernelView.ts`, the full
 * `WebPerceptView` entry point.
 */
export function webPerceptFromVisualKernel(percept) {
    return {
        timestamp: percept.timestamp,
        url: percept.frame.address,
        title: percept.frame.label,
        viewport: percept.viewport,
        scrollY: percept.scrollY,
        scrollHeight: percept.scrollHeight,
        screenshot: percept.screenshot,
        elements: percept.affordances.map((a, index) => {
            const box = a.locator.kind === "bbox" ? a.locator.box : { x: 0, y: 0, width: 0, height: 0 };
            return {
                id: index,
                role: isPerceivedRoleLike(a.kind) ? a.kind : "unknown",
                text: a.description,
                box,
                interactive: a.state.enabled,
                disabled: !a.state.enabled,
                editable: a.state.editable ?? false,
                focused: false,
                clippedByViewport: false,
            };
        }),
        dialogs: percept.signals
            .filter((s) => s.type === "dialog")
            .map((s) => ({ text: s.text, box: null })),
        loadingIndicator: percept.signals.some((s) => s.type === "loading" && s.active),
    };
}
/** The open affordance-kind vocabulary overlaps the legacy ARIA roles. */
function isPerceivedRoleLike(kind) {
    return PERCEIVED_ROLE_LIKE.has(kind);
}
const PERCEIVED_ROLE_LIKE = new Set([
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "select",
    "slider",
    "tab",
    "menuitem",
    "image",
    "heading",
    "text",
    "listitem",
    "dialog",
    "alert",
    "progress",
    "table",
    "unknown",
]);
//# sourceMappingURL=kernel.js.map