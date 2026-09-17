/**
 * Plain-text reader — the last resort, and a real format in its own right.
 *
 * Release notes pasted into a text file, an email body, a `--help` screen
 * captured to disk, a LICENSE. There is no markup to lean on, so structure
 * is inferred the way a person infers it: blank lines separate paragraphs,
 * a short line in isolation is a heading, indented runs are code or output,
 * and a line that starts with a bullet character is a bullet.
 *
 * Two-space-indented `command    description` pairs are how every CLI on
 * earth prints its help, so text shaped that way is read as an interface
 * listing rather than as prose.
 */
import type { Artifact, ReaderInput } from "../types.js";
export declare function readText(input: ReaderInput): Artifact;
//# sourceMappingURL=text.d.ts.map