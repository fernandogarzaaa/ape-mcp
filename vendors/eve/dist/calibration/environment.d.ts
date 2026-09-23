import type { Viewport } from "../core/types.js";
/**
 * Environment fingerprint (Phase 6 calibration substrate).
 *
 * Reproducibility demands knowing WHERE a run executed — but only with
 * values that are actually available. Every field is nullable: unavailable
 * means null, never a fabricated default. The goal is reproducibility,
 * not metadata inflation.
 *
 * Deliberately absent until experiments need them: browser engine/version,
 * driver version, devicePixelRatio, reduced-motion, network profile. The
 * adapter implementation version is recorded separately
 * (`surfaceAdapterVersion`) and must never be conflated with the
 * environment below.
 */
export interface EnvironmentFingerprint {
    /** Adapter implementation name, e.g. "playwright", "mock". */
    readonly adapterName?: string;
    readonly viewport?: Viewport;
    /** Input modality as declared by surface capabilities, e.g. "touch". */
    readonly inputModality?: string;
    /** Operator locale, e.g. "en-US". */
    readonly locale?: string;
    /** IANA timezone when resolvable, else null. */
    readonly timezone?: string | null;
    /** OS platform when running under Node (`process.platform`), else null. */
    readonly os?: string | null;
}
export declare function fingerprintEnvironment(opts?: {
    adapterName?: string;
    viewport?: Viewport;
    inputModality?: string;
    locale?: string;
}): EnvironmentFingerprint;
//# sourceMappingURL=environment.d.ts.map