export function fingerprintEnvironment(opts = {}) {
    let timezone = null;
    try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    }
    catch {
        timezone = null;
    }
    const os = typeof process !== "undefined" && typeof process.platform === "string"
        ? process.platform
        : null;
    return {
        ...(opts.adapterName ? { adapterName: opts.adapterName } : {}),
        ...(opts.viewport ? { viewport: opts.viewport } : {}),
        ...(opts.inputModality ? { inputModality: opts.inputModality } : {}),
        ...(opts.locale ? { locale: opts.locale } : {}),
        timezone,
        os,
    };
}
//# sourceMappingURL=environment.js.map