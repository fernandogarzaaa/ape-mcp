/**
 * Wilson-interval statistics.
 *
 * Shared by the assurance module's false-accept/false-reject reporting: every
 * rate carries a Wilson interval rather than a bare point estimate, because at
 * small probe-suite sizes the intervals are wide and saying so is part of the
 * deliverable.
 */
export interface Interval {
    readonly point: number;
    readonly low: number;
    readonly high: number;
    readonly n: number;
}
/**
 * Wilson score interval at 95%.
 *
 * Chosen over the normal approximation because these proportions cluster near
 * 0 and 1 — exactly where the normal approximation produces intervals that
 * extend below zero and quietly mislead.
 */
export declare function wilson(successes: number, total: number, z?: number): Interval;
export declare function formatInterval(interval: Interval): string;
//# sourceMappingURL=metrics.d.ts.map