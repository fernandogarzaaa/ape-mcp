import type { Percept } from "../core/types.js";
/**
 * Two-tier surface identity (P0.5, reviewer decision 1).
 *
 * ```text
 * SurfaceIdentity  (stable structural identity)
 * SurfaceState     (mutable interaction/semantic state)
 * OutcomeEvidence  (transition/result evidence — see planning/evidence.ts)
 * ```
 *
 * A single key cannot serve both tried-affordance memory and workflow
 * attribution: a key that forks on every keystroke or focus move orphans
 * tried-marks and loops forever (regression: tests/memory-identity.test.ts),
 * while a key that ignores query tabs, dialogs and validation errors aliases
 * materially different states. So:
 *
 * - `stableIdentityKey` — origin + path, layout roles + geometry, heading
 *   gist. NEVER forks on: typing, focus moves, enable/disable toggles,
 *   dialog TEXT, query values, keyboard band, error appearance. Used for
 *   tried-affordances, familiarity, recognition, revisit detection.
 * - `sensitiveStateKey` — stable + classified query values + dialog texts +
 *   validation-error signal + action-tracked form fill + interaction-state
 *   signature (role/geometry/interactive/disabled/editable, no text, no
 *   focus). Used for workflow attribution, transition analysis, outcome
 *   interpretation, state-specific findings. Focus and keyboard-band state
 *   are deliberately excluded — they are interaction evidence on the
 *   Percept, not state discriminators.
 *
 * `screenSignature()` in `./memory.js` is unchanged (backwards compat);
 * `surfaceIdentity()` remains as a deprecated alias of the stable key.
 */
export interface QueryStatePolicy {
    /**
     * Query keys whose values are semantic UI state (tabs, views, steps).
     * Short values discriminate verbatim; longer ones are bucketed.
     */
    readonly stateBearingKeys: readonly string[];
    /**
     * Query keys with high-cardinality user/opaque data. Always bucketed,
     * never verbatim — they must not explode the state graph.
     */
    readonly highCardinalityKeys: readonly string[];
    /** Max length for a verbatim state-bearing value. */
    readonly shortValueMaxLength: number;
}
export declare const DEFAULT_QUERY_STATE_POLICY: QueryStatePolicy;
export type QueryParameterClassification = "state-bearing" | "high-cardinality" | "unknown-key";
export type QueryNormalization = "verbatim" | "bucketed";
/**
 * Explainable per-parameter query classification (reviewer: identity
 * behavior must be debuggable). Each normalized component reports what it
 * is, how it was normalized, and why.
 */
export interface QueryStateClassification {
    readonly parameter: string;
    readonly classification: QueryParameterClassification;
    readonly normalization: QueryNormalization;
    readonly normalized: string;
    readonly reason: string;
}
/** Classify every query parameter of a URL without discarding information. */
export declare function classifyQueryDetailed(url: string, policy?: QueryStatePolicy): readonly QueryStateClassification[];
/**
 * Classified query string for the SENSITIVE tier (reviewer decision 2):
 * state-bearing keys discriminate verbatim when short, everything else is
 * bucketed. Configurable via `QueryStatePolicy` — the length cutoff is a
 * safety mechanism, not the semantic rule.
 */
export declare function classifiedQuery(url: string, policy?: QueryStatePolicy): string;
/** Stable structural identity — see header for the tier contract. */
export declare function stableIdentityKey(percept: Percept): string;
export interface SensitiveStateOptions {
    readonly queryPolicy?: QueryStatePolicy;
    /**
     * Whether the screen carries a validation/error state (the session passes
     * its already-computed error perception — no layer violation, no import
     * cycle with cognition). Distinguishes "same form, validation-error".
     */
    readonly errorSignal?: boolean;
    /**
     * Form fill state tracked from the ACTION stream (reviewer adversarial
     * matrix: "form empty / form populated" must not collapse at the
     * sensitive tier). Perception alone cannot reliably separate an empty
     * field from a filled one across adapters, so the session — which knows
     * which type actions succeeded — supplies it. Omitted → neutral ("-").
     */
    readonly formFill?: "empty" | "populated";
}
/** Mutable semantic state — stable key plus state-bearing distinctions. */
export declare function sensitiveStateKey(percept: Percept, opts?: SensitiveStateOptions): string;
/**
 * @deprecated Prefer `stableIdentityKey` (tried-marks, familiarity,
 * recognition) or `sensitiveStateKey` (workflow, transitions, outcomes).
 * Byte-identical to `stableIdentityKey`.
 */
export declare function surfaceIdentity(percept: Percept): string;
/** True when two percepts share stable structural identity. */
export declare function sameSurface(a: Percept, b: Percept): boolean;
/** True when two percepts share full semantic state. */
export declare function sameState(a: Percept, b: Percept, opts?: SensitiveStateOptions): boolean;
//# sourceMappingURL=surfaceIdentity.d.ts.map