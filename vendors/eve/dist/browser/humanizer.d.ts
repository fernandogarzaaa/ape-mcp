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
    readonly durationMs: number;
}
export declare function planClick(target: VisibleElement, persona: Persona, rng: Rng): Gesture;
export declare function planTap(target: VisibleElement, persona: Persona, rng: Rng, viewport: Viewport): Gesture;
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