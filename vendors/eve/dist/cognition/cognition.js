/** Narrows to {@link FallbackReportingPolicy} if `policy` implements it, else `null`. */
export function asFallbackReportingPolicy(policy) {
    if (typeof policy === "object" &&
        policy !== null &&
        "takeFallbackReason" in policy &&
        typeof policy.takeFallbackReason === "function") {
        return policy;
    }
    return null;
}
//# sourceMappingURL=cognition.js.map