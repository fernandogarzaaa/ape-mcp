/**
 * Structured-data readers — JSON, YAML and delimited tables.
 *
 * These are the artifacts nobody designed for a human and every human ends
 * up reading anyway: the API response in a bug report, the config someone
 * has to change, the CSV export that *is* the analytics review. They fail
 * comprehension in their own characteristic ways — nesting deeper than
 * working memory holds, keys abbreviated past recognition, a column of
 * numbers with no units — and those failures only become visible once the
 * payload is modeled as something read in an order.
 */
import type { Artifact, ReaderInput } from "../types.js";
export declare function detectJson(input: ReaderInput): number;
export declare function detectYaml(input: ReaderInput): number;
export declare function detectDelimited(input: ReaderInput): number;
export declare function readJson(input: ReaderInput): Artifact;
export declare function readYaml(input: ReaderInput): Artifact;
export declare function readDelimited(input: ReaderInput): Artifact;
//# sourceMappingURL=data.d.ts.map