import type { Action } from "../core/types.js";
import { type CanonicalSurfaceIdentity } from "../memory/surfaceIdentity.js";
import type { HumanIterationReference } from "./record.js";
/**
 * Deterministic trajectory alignment (Phase 8 calibration substrate).
 *
 * Answers `human step X ↔ EVE step Y` WITHOUT fuzzy matching: greedy,
 * NON-CROSSING, earliest-match-wins. Step numbers alone are never
 * trusted — alignment proceeds through an explicit evidence ladder:
 *
 * 1. task + stable state (strongest structural match)
 * 2. task + sensitive state
 * 3. task + action semantics (kind, then label)
 * 4. order proximity (weakest — only when nothing else matches)
 *
 * Monotonicity is enforced: once human step X pairs with EVE step Y, no
 * later human step may pair with an EVE step at or before Y. Crossing
 * matches are refused even when states are identical — backtracking
 * surfaces as unmatched + re-matched-forward, never as time travel.
 * Task-conflicting pairs are refused at every level: steps from different
 * tasks are different experiments, full stop.
 *
 * LIMITATIONS (documented, not hidden): greedy matching can misalign
 * repeated identical states; order proximity is a fallback, not evidence
 * of correspondence; action labels are compared case-insensitively as
 * substrings, which is crude for paraphrased human actions. This layer
 * exists to make pilot alignment COMPUTABLE, not to claim it is correct —
 * every pair carries its `basis` so downstream analysis can filter by
 * match strength (e.g. keep only task+state matches for fitting).
 */
export interface HumanStep {
    readonly index: number;
    readonly taskId?: string;
    readonly state?: CanonicalSurfaceIdentity;
    readonly url?: string;
    readonly actionKind?: Action["kind"] | string;
    readonly actionLabel?: string;
    /** Interaction target (control label, field name, URL). Redactable. */
    readonly target?: string;
    readonly timestampMs?: number;
    readonly durationMs?: number;
    readonly transitionTo?: string;
    readonly outcome?: string;
    readonly correction?: string;
    readonly recovery?: HumanIterationReference["recovery"];
    readonly abandoned?: boolean;
    readonly selfReport?: Readonly<Record<string, number>>;
}
export interface EveAlignStep {
    readonly index: number;
    readonly taskId?: string | null;
    readonly stableKey?: string | null;
    readonly sensitiveKey?: string | null;
    readonly url: string;
    readonly actionKind: Action["kind"];
    readonly actionLabel: string;
}
export type AlignmentBasis = "task+stable" | "task+sensitive" | "task+external-id" | "task+url" | "stable" | "sensitive" | "external-id" | "url" | "action-kind" | "action-label" | "order";
export interface AlignedPair {
    readonly humanIndex: number;
    readonly eveIndex: number;
    readonly basis: AlignmentBasis;
}
export interface TraceAlignment {
    readonly pairs: readonly AlignedPair[];
    /** Human steps with no EVE counterpart (extra/confounding behavior). */
    readonly unmatchedHuman: readonly number[];
    /** EVE steps with no human counterpart (model-only exploration). */
    readonly unmatchedEve: readonly number[];
    /** Descriptive coverage fractions — NOT scores, NOT validity claims. */
    readonly coverage: {
        readonly humanMatched: number;
        readonly humanTotal: number;
        readonly eveMatched: number;
        readonly eveTotal: number;
    };
    readonly method: string;
    readonly limitations: readonly string[];
}
/**
 * Align human steps to EVE steps. Deterministic: same inputs →
 * byte-identical alignment. Greedy earliest-match, strictly monotone
 * (non-crossing); each step used at most once on either side. Steps from
 * conflicting tasks never pair at any level.
 */
export declare function alignTraces(human: readonly HumanStep[], eve: readonly EveAlignStep[], opts?: {
    taskId?: string | null;
}): TraceAlignment;
/**
 * Validate + normalize a raw human-study object carrying optional per-step
 * detail into `HumanStep[]`. All step fields optional: a pilot dataset may
 * carry only actions, a full dataset adds targets, durations, corrections,
 * recovery, and self-reports. Unknown fields are ignored, never trusted.
 */
export declare function importHumanSteps(raw: unknown): HumanStep[];
//# sourceMappingURL=alignment.d.ts.map