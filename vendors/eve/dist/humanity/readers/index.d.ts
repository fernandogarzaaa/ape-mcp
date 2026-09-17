/**
 * The reader registry — how bytes become something a human can read.
 *
 * Detection is a confidence auction, not a switch on file extension. An
 * artifact reaches EVE in a lot of ways that carry no filename: piped into
 * `eve read -`, pasted into an issue, returned by an API call, handed over
 * as a string by a programmatic caller. Every reader scores the input and the
 * highest bidder wins, with the plain-text reader as the floor — because a
 * person handed an unrecognizable file still reads it.
 */
import type { Artifact, ArtifactFormat, ArtifactReader, ReaderInput } from "../types.js";
import { readDelimited, readJson, readYaml } from "./data.js";
import { readHtml } from "./html.js";
import { looksLikeSlides, readMarkdown } from "./markdown.js";
import { readText } from "./text.js";
import { readTranscript } from "./transcript.js";
export declare function listReaders(): readonly ArtifactReader[];
/** The reader that bids highest for this input. Never null — text is the floor. */
export declare function selectReader(input: ReaderInput): ArtifactReader;
/**
 * Read any digital output into an {@link Artifact}.
 *
 * `format` forces a reader when the caller knows better than detection — a
 * markdown deck served without an extension, a log captured as `.txt`.
 */
export declare function readArtifactText(input: ReaderInput & {
    readonly format?: ArtifactFormat;
}): Artifact;
export { ArtifactBuilder } from "./builder.js";
export { parseMetric } from "./metrics.js";
export { looksLikeSlides, readDelimited, readHtml, readJson, readMarkdown, readText, readTranscript, readYaml, };
//# sourceMappingURL=index.d.ts.map