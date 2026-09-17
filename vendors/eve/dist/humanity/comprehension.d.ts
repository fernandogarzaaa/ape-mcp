/**
 * The comprehension model — what actually happens when a person reads.
 *
 * EVE's browser operator asks "can I do this?". A reader asks a different
 * question — "do I understand this, and do I know what to do now?" — and it
 * fails in its own ways. Nobody bounces off a report because a button was
 * 3px too small. They bounce off it because the third paragraph used a term
 * the first eleven pages never defined, because the number that mattered had
 * nothing to compare against, because the slide had forty words on it, or
 * because they got to the end and still did not know what they were supposed
 * to do.
 *
 * Two things happen here:
 *
 * 1. **Per block**, a reader with this persona's reading speed, tech
 *    literacy and thoroughness either follows it or does not. Comprehension
 *    is a probability, not a verdict, and it is a *product* of independent
 *    obstacles — long sentences, undefined terms, missing baselines — which
 *    is why three small problems in one paragraph lose a reader that one
 *    large one would not.
 * 2. **Across the artifact**, expectations are checked against the genre.
 *    Those checks are the findings, and each one carries the text that
 *    caused it, because a comprehension claim with no quotation is exactly
 *    the vibes-based judgment EVE's evidence rule exists to prevent.
 */
import type { Finding } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
import { type AcronymUse, type ReadabilityMetrics } from "./readability.js";
import type { Artifact, ArtifactBlock, ArtifactGenre } from "./types.js";
/** One reason a reader did not fully follow a block. */
export interface ComprehensionObstacle {
    readonly kind: "long-sentence" | "undefined-term" | "jargon" | "wall-of-text" | "unlabeled-figure" | "missing-baseline" | "wide-table" | "deep-nesting" | "dense-slide" | "raw-error";
    /** How much of the reader's grasp this costs, 0..1. */
    readonly cost: number;
    /** The text that caused it — the evidence behind any finding downstream. */
    readonly evidence: string;
}
export interface BlockComprehension {
    readonly blockId: string;
    /** Probability this reader followed the block, 0..1. */
    readonly comprehension: number;
    /** How much of the reader's capacity the block consumed, 0..1. */
    readonly effort: number;
    /** Simulated reading time for this persona, in ms. */
    readonly readingTimeMs: number;
    readonly obstacles: readonly ComprehensionObstacle[];
    readonly readability: ReadabilityMetrics;
}
/** Read one block as this persona, given what the artifact defined earlier. */
export declare function comprehendBlock(block: ArtifactBlock, persona: Persona, context: {
    readonly undefinedAcronyms: ReadonlySet<string>;
    readonly genre: ArtifactGenre;
}): BlockComprehension;
export interface ComprehensionAnalysis {
    readonly artifact: string;
    readonly genre: ArtifactGenre;
    readonly persona: string;
    /** Mean per-block comprehension, weighted by words read. 0..100. */
    readonly comprehensionScore: number;
    /** Reading time for the whole artifact at this persona's pace, in ms. */
    readonly readingTimeMs: number;
    readonly readability: ReadabilityMetrics;
    readonly blocks: readonly BlockComprehension[];
    readonly acronyms: readonly AcronymUse[];
    /** Findings, in EVE's normal shape minus the fields the session assigns. */
    readonly findings: readonly Omit<Finding, "id" | "timestamp">[];
}
/**
 * Read the whole artifact as this persona and report the experience.
 *
 * Pure and deterministic: the same artifact and persona always produce the
 * same analysis, so it can be asserted on in tests and diffed across builds
 * the way `eve trends` diffs sessions.
 */
export declare function analyzeComprehension(artifact: Artifact, persona: Persona): ComprehensionAnalysis;
//# sourceMappingURL=comprehension.d.ts.map