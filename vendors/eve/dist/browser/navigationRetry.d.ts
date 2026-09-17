/**
 * Surviving navigation while perceiving.
 *
 * The perception script runs inside the page, so a navigation destroys the
 * execution context it is running in. When a click follows a link, the very
 * next percept can land in that window and the driver throws instead of
 * returning a screen — which, without this, aborts the whole session.
 *
 * A human in that position does not crash: they notice the page is changing,
 * wait for it, and look again. That is exactly what this does.
 */
/** True when the failure is a page navigation rather than a dead browser. */
export declare function isNavigationTeardown(error: unknown): boolean;
export interface PerceiveRetryOptions {
    /** Total attempts, including the first. */
    attempts?: number;
    /** Base pause between attempts; grows linearly so a slow page still lands. */
    backoffMs?: number;
}
/**
 * Run a perception attempt, retrying only when the page navigated mid-flight.
 * Any other error propagates untouched — a broken adapter must stay loud.
 */
export declare function perceiveAcrossNavigation<T>(perceive: () => Promise<T>, wait: (ms: number) => Promise<void>, options?: PerceiveRetryOptions): Promise<T>;
//# sourceMappingURL=navigationRetry.d.ts.map