/**
 * Transcript reader — terminal sessions, CI logs, stack traces.
 *
 * The `CliAdapter` drives a live process; this reads the record one left
 * behind. That distinction matters more than it sounds: a transcript is the
 * artifact a person is handed when something has already gone wrong — pasted
 * into an issue, linked from a red build, scrolled through at 2am — and the
 * question is never "what can I click" but "what happened, and what am I
 * supposed to do now".
 *
 * So the structure this reader recovers is the one a reader actually looks
 * for: which commands were run, what each one printed, and where the errors
 * are. Each command opens a section, because that is the unit people scroll
 * between when they are hunting.
 */
import type { Artifact, ReaderInput } from "../types.js";
export declare function detectTranscript(input: ReaderInput): number;
export declare function readTranscript(input: ReaderInput): Artifact;
//# sourceMappingURL=transcript.d.ts.map