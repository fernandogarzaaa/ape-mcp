/**
 * HTML reader — rendered output, read rather than driven.
 *
 * The browser adapters already *operate* live pages. This reader is for the
 * other half of the web: the HTML nobody clicks. An emailed report, an
 * exported dashboard, a generated coverage summary, a static docs page saved
 * to disk. There is no live DOM here and no browser — just markup and a
 * person trying to understand what it says.
 *
 * Deliberately a tokenizer, not a DOM: EVE perceives what renders, and what
 * renders is the visible text in document order plus the structure the tags
 * imply. Script, style and template contents never reach a reader's eye, so
 * they never reach the artifact.
 */
import type { Artifact, ReaderInput } from "../types.js";
export declare function detectHtml(input: ReaderInput): number;
export declare function readHtml(input: ReaderInput): Artifact;
//# sourceMappingURL=html.d.ts.map