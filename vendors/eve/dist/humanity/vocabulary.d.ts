/**
 * The humanity pack's vocabulary registration.
 *
 * Reading fails along axes the sixteen built-in dimensions do not name.
 * "Usability" does not describe a paragraph nobody can parse; "navigation"
 * does not describe a deck whose slide titles assert nothing. So the pack
 * registers its own — `humanity.comprehension`, `humanity.readability`,
 * `humanity.structure` — through the Phase-0 registries rather than by
 * editing core, exactly as the MCP pack does.
 *
 * All three are `appliesTo: ["document"]`: a live page is not scored for
 * whether its prose has a baseline for every number, and a document is not
 * scored for tap-target size. Registration is idempotent, because the
 * registries are process-global and reject duplicates loudly.
 */
/** The dimensions a reading session is scored on. */
export declare const HUMANITY_DIMENSIONS: readonly ["humanity.comprehension", "humanity.readability", "humanity.structure"];
export type HumanityDimension = (typeof HUMANITY_DIMENSIONS)[number];
/** Register the humanity pack's dimensions, categories and reading verbs. */
export declare function registerHumanityVocabulary(): void;
//# sourceMappingURL=vocabulary.d.ts.map