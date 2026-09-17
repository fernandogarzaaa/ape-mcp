/**
 * Surface preflight — which of EVE's surfaces actually work here.
 *
 * EVE spans four modalities, and only the visual one depends on anything
 * outside the package. The failure that motivated this check is specific:
 * the driver imports fine, and the browser binaries it wants are absent, so
 * the run dies at `launch()` several seconds in, mid-session, with an error
 * about an executable path. That is a setup problem wearing a runtime
 * problem's clothes, and it should be answerable before a session starts.
 *
 * Nothing here is a session. Each probe loads a driver and, where a driver
 * needs more than itself, launches and immediately closes a browser.
 */
/**
 * `unverified` is the honest answer for a surface EVE cannot fully check
 * without doing the very thing a preflight must not do — start a real
 * session. Reporting such a surface as `ready` would be a promise it cannot
 * keep; reporting it as `needs-setup` would send people to fix what may well
 * be fine.
 */
export type SurfaceStatus = "ready" | "unverified" | "needs-setup" | "broken";
/** True when a surface's absence costs the user no capability. */
export declare function isOptionalTransport(surface: string): boolean;
export interface SurfaceReport {
    /** The adapter name, as `--browser` accepts it. */
    readonly surface: string;
    readonly status: SurfaceStatus;
    /** What EVE can do with this surface, in the user's terms. */
    readonly provides: string;
    /** Present when status is not "ready": what to run to fix it. */
    readonly remedy?: string;
    /** Present when status is not "ready": what actually went wrong. */
    readonly detail?: string;
}
/** Check every surface EVE can run, in parallel. */
export declare function diagnoseSurfaces(): Promise<readonly SurfaceReport[]>;
/** Render the preflight for a terminal. */
export declare function renderDoctor(reports: readonly SurfaceReport[]): string;
//# sourceMappingURL=doctor.d.ts.map