/**
 * Getting an artifact in front of the reader.
 *
 * A digital output arrives as a path, a URL, a pipe, or a string a caller
 * already has in hand. All four land in the same place — bytes plus an
 * address the operator could plausibly read off the artifact itself — and
 * from there the reader registry takes over.
 */
import type { Artifact, ArtifactFormat, ArtifactGenre } from "./types.js";
/** The `doc:` scheme `eve run` uses to route a target at the humanity seam. */
export declare const DOC_SCHEME = "doc:";
export interface LoadArtifactOptions {
    /** Force a reader instead of letting detection choose. */
    readonly format?: ArtifactFormat;
    /** Force the genre instead of inferring it from content. */
    readonly genre?: ArtifactGenre;
    /** Milliseconds to wait on an HTTP target before giving up. */
    readonly timeoutMs?: number;
}
/** Strip the `doc:` scheme, leaving the underlying target. */
export declare function docTargetOf(target: string): string;
/**
 * Load an artifact from a path, an http(s) URL, or `-` for standard input.
 *
 * The address kept on the artifact is the target as written, minus the
 * `doc:` routing prefix: that is what a reader would say they were looking
 * at, and it is what every report cites.
 */
export declare function loadArtifact(target: string, options?: LoadArtifactOptions): Promise<Artifact>;
/** Read an artifact already in memory — the programmatic entry point. */
export declare function artifactFromText(address: string, text: string, options?: LoadArtifactOptions): Artifact;
//# sourceMappingURL=source.d.ts.map