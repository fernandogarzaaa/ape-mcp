import { WALL_CLOCK } from "../core/clock.js";
export class Observer {
    adapter;
    sessionStart;
    clock;
    constructor(adapter, sessionStart = Date.now(), 
    /**
     * Where elapsed time comes from. Defaults to the wall clock so existing
     * callers driving a real browser are unaffected; pass a simulated clock to
     * make a run replayable.
     */
    clock = WALL_CLOCK) {
        this.adapter = adapter;
        this.sessionStart = sessionStart;
        this.clock = clock;
    }
    /**
     * Look at the screen. If a loading indicator is visible, keep watching —
     * as a human would — until it clears or patience (settleTimeoutMs) runs
     * out. The time spent watching is the perceived latency.
     */
    async observe(options = {}) {
        const settleTimeoutMs = options.settleTimeoutMs ?? 8_000;
        const pollMs = options.pollMs ?? 250;
        const start = this.clock.now();
        let snap = await this.adapter.snapshot();
        while (snap.loadingIndicator && this.clock.now() - start < settleTimeoutMs) {
            // `sleep` on a simulated clock advances it by `pollMs` without blocking,
            // so the settle wait is a count of polls rather than a measurement of
            // how busy the host was.
            await this.clock.sleep(pollMs);
            snap = await this.adapter.snapshot();
        }
        const settleMs = this.clock.now() - start;
        const screenshot = options.withScreenshot ? await this.adapter.screenshot() : null;
        const keyboardOcclusion = modelKeyboardOcclusion(this.adapter, snap.viewport, snap.elements);
        const elements = keyboardOcclusion
            ? snap.elements.map((el) => intersectsBottomBand(el.box, keyboardOcclusion)
                ? { ...el, occludedByKeyboard: true }
                : el)
            : snap.elements;
        const percept = {
            timestamp: this.clock.now() - this.sessionStart,
            url: snap.url,
            title: snap.title,
            viewport: snap.viewport,
            scrollY: snap.scrollY,
            scrollHeight: snap.scrollHeight,
            screenshot,
            elements,
            dialogs: snap.dialogs,
            loadingIndicator: snap.loadingIndicator,
            keyboardOcclusion,
        };
        return { percept, settleMs };
    }
}
/**
 * A modeled soft-keyboard band, or null when none is up. Touch surfaces only,
 * and only while a focused editable element is present — a keyboard has no
 * reason to be showing otherwise.
 */
function modelKeyboardOcclusion(adapter, viewport, elements) {
    if (adapter.capabilities.pointer !== "touch")
        return null;
    const heightPx = adapter.deviceMetrics?.softKeyboardHeightPx;
    if (!heightPx)
        return null;
    const focusedEditable = elements.some((el) => el.focused && el.editable);
    if (!focusedEditable)
        return null;
    const height = Math.min(heightPx, viewport.height);
    return { x: 0, y: viewport.height - height, width: viewport.width, height };
}
function intersectsBottomBand(box, band) {
    return box.y + box.height > band.y;
}
//# sourceMappingURL=perception.js.map