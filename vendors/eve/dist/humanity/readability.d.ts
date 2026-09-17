/**
 * Readability — how hard the prose is, measured the way reading research
 * measures it.
 *
 * EVE's rule is that every number traces to something that happened, and
 * that applies here too: these are counted properties of the text (sentence
 * lengths, syllables, terms introduced without definition), never an opinion
 * about the writing. A low Flesch score is not "bad writing" — it is a
 * measured claim that this reader, at this reading level, will have to work
 * for it, and the comprehension model is what turns that into an experience.
 */
export interface ReadabilityMetrics {
    readonly words: number;
    readonly sentences: number;
    readonly syllables: number;
    readonly meanSentenceWords: number;
    /** Flesch Reading Ease, 0..100+. Higher is easier; 60 is plain English. */
    readonly fleschReadingEase: number;
    /** Flesch–Kincaid grade level — years of schooling assumed by the prose. */
    readonly gradeLevel: number;
    /** Words of three or more syllables, as a share of all words. */
    readonly complexWordRatio: number;
    readonly longestSentenceWords: number;
}
/** Measure a passage. Empty text is perfectly readable and says nothing. */
export declare function measureReadability(text: string): ReadabilityMetrics;
export declare function splitSentences(text: string): string[];
/**
 * Syllable estimate: vowel groups, minus a silent trailing "e", never below
 * one. The standard heuristic behind every Flesch implementation — accurate
 * enough in aggregate, which is the only scale the score is read at.
 */
export declare function countSyllables(word: string): number;
/** Acronyms used in the text, split by whether the text ever expands them. */
export interface AcronymUse {
    readonly acronym: string;
    /** True when the artifact defines it: "Service Level Objective (SLO)". */
    readonly introduced: boolean;
    readonly firstSeenIn: string;
}
/**
 * Find acronyms and decide whether the artifact ever introduced them.
 *
 * Two forms count as an introduction, because both are how writing actually
 * does it: the expansion followed by the acronym in parentheses, and the
 * acronym followed by its expansion. Anything else is a term the reader is
 * assumed to already know — which is a claim about the audience the artifact
 * never checked.
 */
export declare function findAcronyms(passages: readonly string[]): readonly AcronymUse[];
/** Jargon terms present in the text, deduplicated and lowercased. */
export declare function findJargon(text: string): readonly string[];
/** The jargon vocabulary, exposed so domain packs can reason about it. */
export declare function jargonVocabulary(): readonly string[];
//# sourceMappingURL=readability.d.ts.map