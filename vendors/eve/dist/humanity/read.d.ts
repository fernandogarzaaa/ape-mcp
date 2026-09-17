/**
 * `readArtifact` — the one call that reads a digital output like a human.
 *
 * It wires the pieces the same way `eve run` wires a browser session: a
 * humanity adapter over the artifact, the session loop for the moment-to-
 * moment experience, and the comprehension plugin for the judgment the
 * reader forms about the artifact as a whole. What comes back is an ordinary
 * `SessionResult` — scored, evidence-backed, renderable by every existing
 * report — plus the comprehension analysis alongside it.
 *
 * Finishing is modeled as success, not as running out of budget: the reader
 * perceives the end of the artifact, and that visible line is the session's
 * goal success signal. A document EVE read to the end ends `goal-achieved`;
 * one it put down halfway ends `abandoned`, which is exactly the distinction
 * that makes a reading score mean anything.
 */
import { type SessionOptions, type SessionResult } from "../engine/session.js";
import type { Persona } from "../personas/persona.js";
import type { EvePlugin } from "../plugins/plugin.js";
import type { ComprehensionAnalysis } from "./comprehension.js";
import type { Artifact, ArtifactFormat, ArtifactGenre } from "./types.js";
export interface ReadOptions extends Omit<Partial<SessionOptions>, "adapter" | "startUrl" | "persona"> {
    readonly persona?: Persona | string;
    /** Force a reader instead of letting detection choose. */
    readonly format?: ArtifactFormat;
    /** Force the genre instead of inferring it from content. */
    readonly genre?: ArtifactGenre;
    /** Extra plugins, alongside the comprehension plugin. */
    readonly plugins?: readonly EvePlugin[];
}
export interface ReadingResult extends SessionResult {
    /** The artifact as the reader perceived it. */
    readonly artifact: Artifact;
    /** What this reader understood, and what got in the way. */
    readonly comprehension: ComprehensionAnalysis;
}
/** Read an artifact from a path, an http(s) URL, or `-` for standard input. */
export declare function readArtifact(target: string, options?: ReadOptions): Promise<ReadingResult>;
/** Read an artifact already in memory — no filesystem, no network. */
export declare function readText(address: string, text: string, options?: ReadOptions): Promise<ReadingResult>;
/** Run a reading session over an artifact that has already been parsed. */
export declare function readLoadedArtifact(artifact: Artifact, options?: ReadOptions): Promise<ReadingResult>;
//# sourceMappingURL=read.d.ts.map