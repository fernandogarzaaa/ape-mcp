import type { Rng } from "../core/random.js";
import type { Point, Viewport, VisibleElement } from "../core/types.js";
import { type Persona } from "../personas/persona.js";
/**
 * Humanizer: turns an abstract intent ("click that button") into the noisy,
 * time-consuming gesture a real person performs.
 *
 * - Click points scatter around the target center (Gaussian, persona-scaled)
 *   and can genuinely miss small targets — producing the same misclick
 *   behavior real users exhibit on cramped UI.
 * - Every gesture consumes wall-clock-equivalent time derived from persona
 *   motor speed (used both for pacing real browsers and for the simulated
 *   clock in reports).
 * - Typing has per-character cadence and occasional corrected typos.
 */
export interface Gesture {
    readonly point: Point;
    /** True when the scatter landed outside the intended target. */
    readonly missed: boolean;
    /**
     * What the miss MEANT (P1.1):
     * - "hit": landed on target.
     * - "corrected": mis-aim noticed and corrected (re-aimed at center) with
     *   a time cost — the environment sees the intended target.
     * - "stray": true wrong-target interaction — `point` is the actual
     *   scattered landing and the environment receives it.
     */
    readonly disposition: "hit" | "corrected" | "stray";
    readonly durationMs: number;
}
/**
 * Miss-disposition policy (reviewer decision 5).
 *
 * Hierarchy (most → least general): global physical interaction model →
 * device/surface parameters → persona motor parameters. The threshold is
 * therefore a property of the PLAN CALL (device-aware defaults), not of the
 * persona — a 12px miss means something different on a touch phone than
 * under a desktop mouse, and it is normalized against the live scatter
 * (which already folds in persona accuracy, target geometry and device).
 *
 * HEURISTIC PARAMETER — provisional deterministic rule, explicitly
 * uncalibrated. Do not fit per-persona values until human trajectory data
 * justifies them.
 */
export interface MisclickPolicy {
    /** Misses within this px distance (near-edge slips) are corrected. */
    readonly nearMissThresholdPx: number;
    /** ...or within scatter × this multiple, whichever is larger. */
    readonly scatterMultiple: number;
}
export declare const CLICK_MISCLICK_POLICY: MisclickPolicy;
export declare const TAP_MISCLICK_POLICY: MisclickPolicy;
export declare function planClick(target: VisibleElement, persona: Persona, rng: Rng, policy?: MisclickPolicy): Gesture;
export declare function planTap(target: VisibleElement, persona: Persona, rng: Rng, viewport: Viewport, policy?: MisclickPolicy): Gesture;
export interface TypingPlan {
    /** The keystroke sequence, including typo + backspace corrections. */
    readonly keystrokes: readonly string[];
    readonly perCharIntervalMs: number;
    readonly totalMs: number;
    readonly typoCount: number;
}
export declare function planTyping(text: string, persona: Persona, rng: Rng): TypingPlan;
/**
 * Touch equivalent of {@link planTyping}: typing on a soft keyboard.
 *
 * Slower per-character cadence (no tactile key edges to feel for) and a
 * higher typo rate (fingertip-sized keys, no physical travel to confirm a
 * keypress registered).
 */
export declare function planSoftKeyType(text: string, persona: Persona, rng: Rng): TypingPlan;
export interface SwipeSegment {
    /** Scroll delta for this segment, in CSS px (same sign convention as `scrollBy`). */
    readonly deltaY: number;
    readonly durationMs: number;
}
export interface SwipePlan {
    /** A flick followed by decaying momentum segments, never one atomic jump. */
    readonly segments: readonly SwipeSegment[];
    readonly totalMs: number;
}
/**
 * Plans a swipe-to-scroll gesture as a flick plus decaying momentum, the way
 * a touch scroll actually feels — never the single atomic jump a mouse wheel
 * event is. The adapter still only ever receives plain `scrollBy(deltaY)`
 * calls, one per segment; composing the momentum curve is cognition's job,
 * not the adapter's.
 */
export declare function planSwipe(totalDeltaY: number, persona: Persona, rng: Rng): SwipePlan;
/** Hesitation pause before a consequential action, in ms. */
export declare function hesitationMs(risk: number, persona: Persona, rng: Rng): number;
//# sourceMappingURL=humanizer.d.ts.map