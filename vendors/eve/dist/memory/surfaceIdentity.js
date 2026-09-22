export const DEFAULT_QUERY_STATE_POLICY = {
    stateBearingKeys: [
        "tab",
        "view",
        "mode",
        "step",
        "page",
        "sort",
        "filter",
        "section",
        "stage",
        "pane",
        "panel",
    ],
    highCardinalityKeys: ["q", "search", "query", "session", "tracking", "token", "id", "sid"],
    shortValueMaxLength: 24,
};
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}
function originPath(url) {
    try {
        const u = new URL(url);
        return `${u.origin}${u.pathname}`;
    }
    catch {
        return url;
    }
}
/** Length bucket for high-cardinality values (never verbatim). */
function bucket(v) {
    return v.length <= 24 ? "s" : v.length <= 96 ? "m" : "l";
}
/** Classify every query parameter of a URL without discarding information. */
export function classifyQueryDetailed(url, policy = DEFAULT_QUERY_STATE_POLICY) {
    try {
        const u = new URL(url);
        // All key-value entries (not just names): `?filter=a&filter=b` and
        // `?filter=a&filter=c` must not collapse (CodeRabbit PR #39). Sorted as
        // complete pairs so order swaps don't fork identity either.
        const entries = [...u.searchParams.entries()].sort(([ka, va], [kb, vb]) => ka === kb ? (va < vb ? -1 : va > vb ? 1 : 0) : ka < kb ? -1 : 1);
        const state = new Set(policy.stateBearingKeys.map((k) => k.toLowerCase()));
        const cardinal = new Set(policy.highCardinalityKeys.map((k) => k.toLowerCase()));
        return entries.map(([k, v]) => {
            const lk = k.toLowerCase();
            if (cardinal.has(lk)) {
                return {
                    parameter: k,
                    classification: "high-cardinality",
                    normalization: "bucketed",
                    normalized: `${k}=${bucket(v)}`,
                    reason: `"${k}" is a high-cardinality key: values must not explode the state graph`,
                };
            }
            if (state.has(lk) && v.length <= policy.shortValueMaxLength) {
                return {
                    parameter: k,
                    classification: "state-bearing",
                    normalization: "verbatim",
                    normalized: `${k}=${v}`,
                    reason: `"${k}" is a state-bearing key with a short (${v.length}ch) value`,
                };
            }
            if (state.has(lk)) {
                return {
                    parameter: k,
                    classification: "state-bearing",
                    normalization: "bucketed",
                    normalized: `${k}=${bucket(v)}`,
                    reason: `"${k}" is state-bearing but the value (${v.length}ch) exceeds shortValueMaxLength=${policy.shortValueMaxLength}`,
                };
            }
            return {
                parameter: k,
                classification: "unknown-key",
                normalization: "bucketed",
                normalized: `${k}=${bucket(v)}`,
                reason: `"${k}" is in neither key list: bucketed conservatively (add it to the policy to discriminate it)`,
            };
        });
    }
    catch {
        return [];
    }
}
/**
 * Classified query string for the SENSITIVE tier (reviewer decision 2):
 * state-bearing keys discriminate verbatim when short, everything else is
 * bucketed. Configurable via `QueryStatePolicy` — the length cutoff is a
 * safety mechanism, not the semantic rule.
 */
export function classifiedQuery(url, policy = DEFAULT_QUERY_STATE_POLICY) {
    // Dedupe exact-duplicate pairs (`?a=1&a=1` ≡ `?a=1`); distinct values
    // stay distinct.
    return [...new Set(classifyQueryDetailed(url, policy).map((p) => p.normalized))].join("&");
}
function structurePart(percept) {
    // Roles + geometry of interactive elements — deliberately NO label text,
    // NO focus flag, NO disabled flag, NO alerts (an appearing validation
    // error must not fork the stable key or tried-marks orphan — see header).
    // Heading text IS included: same-layout screens ("Login" vs "Sign up")
    // need discrimination, and field values never appear in headings.
    const items = percept.elements
        .filter((e) => e.interactive || e.editable || e.role === "heading" || e.role === "menuitem")
        .map((e) => {
        const b = e.box;
        const geo = `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}x${Math.round(b.height)}`;
        const label = e.role === "heading" ? e.text.trim().toLowerCase().slice(0, 40) : "";
        return `${e.role}@${geo}:${label}`;
    })
        .sort();
    return hashStr(items.join("|"));
}
/** Stable structural identity — see header for the tier contract. */
export function stableIdentityKey(percept) {
    return [originPath(percept.url), structurePart(percept)].join("::");
}
/**
 * Interaction-state signature for the SENSITIVE tier (reviewer final defect
 * fix): role + rounded geometry + interactive/disabled/editable flags for
 * relevant controls — NO user-entered text, NO focus flag.
 *
 * A disabled "Save" and an enabled "Save" share the stable layout but are
 * different workflow states (different transitions, expectations, recovery
 * paths). Typing, focus moves and cursor travel never touch these flags, so
 * the tried-mark stability invariant is preserved.
 */
function interactionStatePart(percept) {
    const items = percept.elements
        .filter((e) => e.interactive || e.editable)
        .map((e) => {
        const b = e.box;
        const geo = `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}x${Math.round(b.height)}`;
        const flags = `${e.interactive ? "i" : "-"}${e.disabled ? "d" : "-"}${e.editable ? "e" : "-"}`;
        return `${e.role}@${geo}:${flags}`;
    })
        .sort();
    return `ia:${hashStr(items.join("|"))}`;
}
/** Mutable semantic state — stable key plus state-bearing distinctions. */
export function sensitiveStateKey(percept, opts = {}) {
    const query = classifiedQuery(percept.url, opts.queryPolicy);
    const dialogs = percept.dialogs.length === 0
        ? "-"
        : `dlg:${hashStr(percept.dialogs
            .map((x) => `${x.source ?? "dom"}:${x.text.slice(0, 80)}`)
            .sort()
            .join("||"))}`;
    // NOTE: focus and keyboard-band state are deliberately ABSENT (reviewer:
    // focus belongs neither in stable identity nor as a default sensitive
    // discriminator). Focus/keyboard remain interaction evidence on the
    // Percept (`focused`, `keyboardOcclusion`) for outcome analysis.
    const err = opts.errorSignal ? "err" : "-";
    const fill = opts.formFill === "populated" ? "pop" : opts.formFill === "empty" ? "clr" : "-";
    return [
        stableIdentityKey(percept),
        query || "-",
        dialogs,
        err,
        fill,
        interactionStatePart(percept),
    ].join("::");
}
/**
 * @deprecated Prefer `stableIdentityKey` (tried-marks, familiarity,
 * recognition) or `sensitiveStateKey` (workflow, transitions, outcomes).
 * Byte-identical to `stableIdentityKey`.
 */
export function surfaceIdentity(percept) {
    return stableIdentityKey(percept);
}
/** True when two percepts share stable structural identity. */
export function sameSurface(a, b) {
    return stableIdentityKey(a) === stableIdentityKey(b);
}
/** True when two percepts share full semantic state. */
export function sameState(a, b, opts = {}) {
    return sensitiveStateKey(a, opts) === sensitiveStateKey(b, opts);
}
//# sourceMappingURL=surfaceIdentity.js.map