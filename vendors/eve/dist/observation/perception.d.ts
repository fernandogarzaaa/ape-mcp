import type { BrowserAdapter } from "../browser/adapter.js";
import { type Clock } from "../core/clock.js";
import type { Percept } from "../core/types.js";
/**
 * The observation layer turns raw adapter snapshots into {@link Percept}s —
 * timestamped, immutable records of what the operator saw. It also measures
 * perceived latency: the time a human experiences between acting and the
 * screen settling, read from the {@link Clock} it is given. Against a real
 * browser that is the wall clock, because the wait is real; against a
 * deterministic surface it is a simulated clock, because the wait is modeled
 * and the host machine's scheduling must not reach the percept.
 *
 * On touch surfaces it also models soft-keyboard occlusion. No headless
 * browser renders a real on-screen keyboard, so this cannot be perceived from
 * the page the way everything else in a `Percept` is — it is computed here,
 * deterministically, from the adapter's declared `deviceMetrics` and whether
 * a focused editable element is present. That keeps the modeling in one
 * place, clearly attributed, rather than letting it masquerade as sensed data
 * anywhere downstream (findings, reports).
 */
export interface ObserveOptions {
    /** Capture a screenshot with this percept. */
    withScreenshot?: boolean;
    /** Max ms to wait for a loading indicator to clear before giving up. */
    settleTimeoutMs?: number;
    /** Poll interval while waiting for settle. */
    pollMs?: number;
}
export interface Observation {
    readonly percept: Percept;
    /** Ms spent waiting for the screen to settle (perceived latency). */
    readonly settleMs: number;
}
export declare class Observer {
    private readonly adapter;
    private readonly sessionStart;
    /**
     * Where elapsed time comes from. Defaults to the wall clock so existing
     * callers driving a real browser are unaffected; pass a simulated clock to
     * make a run replayable.
     */
    private readonly clock;
    constructor(adapter: BrowserAdapter, sessionStart?: number, 
    /**
     * Where elapsed time comes from. Defaults to the wall clock so existing
     * callers driving a real browser are unaffected; pass a simulated clock to
     * make a run replayable.
     */
    clock?: Clock);
    /**
     * Look at the screen. If a loading indicator is visible, keep watching —
     * as a human would — until it clears or patience (settleTimeoutMs) runs
     * out. The time spent watching is the perceived latency.
     */
    observe(options?: ObserveOptions): Promise<Observation>;
}
//# sourceMappingURL=perception.d.ts.map