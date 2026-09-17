/**
 * Did the reply engage with the question?
 *
 * The one comparison this seam keeps making: a person asks something, gets a
 * fluent paragraph back, and has to work out whether it was an answer or an
 * answer to something else. Both the adapter (live, to decide whether the
 * operator perceives a miss) and the analysis (afterwards, to report it) need
 * exactly the same judgment, so it lives here once rather than in each.
 *
 * Stemming is not a nicety here — it is the difference between working and
 * being actively harmful. "I want a refund because I was charged twice"
 * answered with "I've refunded the duplicate charge" shares no *literal*
 * word with the question: refund/refunded and charged/charge are different
 * strings. Comparing raw tokens marks a perfect reply as a near-miss, which
 * is the worst error this tool can make — telling someone their good bot is
 * a bad one.
 */
/**
 * Reduce a word to a stem a reader would treat as the same concept.
 *
 * Deliberately a suffix-stripper rather than a real morphological stemmer:
 * the comparison downstream is a ratio over a handful of words, so precision
 * matters far less than catching the everyday inflections people actually
 * use — refund/refunded, charge/charged/charges, cancel/cancelling.
 */
export declare function stem(word: string): string;
/** The words that carry a sentence's meaning, stemmed and deduplicated. */
export declare function contentWords(text: string): Set<string>;
/** Share of the question's meaningful words the reply picks up, 0..1. */
export declare function overlapRatio(question: string, reply: string): number;
/**
 * True when the surface answered a different question without saying so.
 *
 * Conservative on purpose, in both directions that matter: a reply too short
 * to be an answer is never judged, and a question with almost no content
 * words is never judged either — there is nothing there to miss.
 */
export declare function isNearMiss(question: string, reply: string): boolean;
//# sourceMappingURL=overlap.d.ts.map