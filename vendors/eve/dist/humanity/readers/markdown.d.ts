/**
 * Markdown reader — documents and decks.
 *
 * Markdown is where most software writes to humans: READMEs, specs, release
 * notes, runbooks, and (with `---` between slides) a large share of the
 * world's technical presentations. The reader perceives what renders — a
 * heading is a heading because it looks like one, an image with no alt text
 * is a picture the reader cannot interpret — and nothing that does not.
 */
import type { Artifact, ReaderInput, TableDetail } from "../types.js";
/** Deck heuristics: `---` separators carrying headings, or a slides extension. */
export declare function looksLikeSlides(text: string, extension: string | null): boolean;
export declare function readMarkdown(input: ReaderInput): Artifact;
/** Strip the syntax a renderer consumes, leaving the text a reader sees. */
export declare function stripInline(text: string): string;
/**
 * Remove HTML tags from markdown source.
 *
 * Repeated to a fixpoint rather than done in one pass: removing `<a>` from
 * `<<a>script>` splices the halves back together into `<script>`, and a
 * single global replace never revisits the ground it has already covered.
 * The passes are bounded and the loop ends with a sweep for any `<` still
 * beginning a tag, so deep nesting can neither outrun the fixpoint nor make
 * a pathological line cost quadratic time.
 *
 * A lone `<` in prose ("if x < y") is not a tag and survives, because that
 * is what a reader sees.
 *
 * This is **not** a sanitizer and must not be used as one. It exists so a
 * block's perceived text is what a reader would read rather than the markup
 * a renderer consumes. Escaping for output is the renderer's job and is done
 * independently — see `escapeHtml` in `src/reporting/html.ts`.
 */
export declare function stripHtmlTags(text: string): string;
/** What a reader takes away at a glance: the shape, then the header row. */
export declare function tableSummary(detail: TableDetail): string;
//# sourceMappingURL=markdown.d.ts.map