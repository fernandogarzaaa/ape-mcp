/**
 * Loading the browser drivers, and saying something useful when it fails.
 *
 * Playwright ships as a real dependency, so the visual surface works from a
 * plain `npm install`. Puppeteer and Selenium remain on-demand: they are
 * *alternative transports for the same modality*, held at deliberate parity
 * with Playwright (see `docs/architecture.md`), so bundling them would add a
 * second browser download and an external driver requirement without adding
 * a single capability.
 *
 * "On-demand" is only acceptable if the failure explains itself, which is why
 * the two cases below are kept apart. A driver that is absent and a driver
 * that is present but broken need opposite responses from the user, and
 * reporting the second as the first sends them to reinstall a package they
 * already have.
 */
/** The driver package is not installed. Recoverable by installing it. */
export declare class DriverMissingError extends Error {
    readonly driver: string;
    readonly installCommand: string;
    constructor(driver: string, installCommand: string);
}
/** The driver package is installed but failed to load. Not an install problem. */
export declare class DriverLoadError extends Error {
    readonly driver: string;
    constructor(driver: string, cause: unknown);
}
/**
 * Import an optional driver, classifying the two failure modes.
 *
 * The specifier is passed as a value rather than written inline so the
 * bundler and `tsc` do not try to resolve an optional package at build time.
 * Callers unwrap the namespace themselves: the drivers disagree about whether
 * the useful surface is the default export or the namespace, and guessing
 * here would paper over that.
 */
export declare function importDriver(spec: string, installCommand: string): Promise<unknown>;
/**
 * True when a launch failure means the browser or driver was never installed.
 *
 * Distinct from a missing package: the npm package installs the driver, but
 * the browser executables are fetched by a postinstall step that CI images
 * and sandboxes routinely skip (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`). The
 * package is present and importable; there is simply no browser to launch.
 *
 * Everything else — a sandbox denial, a missing shared library, an OOM kill —
 * is a real failure of an installed browser, and reinstalling it will not
 * help. Those are reported as broken rather than as needing setup.
 */
export declare function isMissingBrowserBinary(error: unknown): boolean;
//# sourceMappingURL=driverLoader.d.ts.map