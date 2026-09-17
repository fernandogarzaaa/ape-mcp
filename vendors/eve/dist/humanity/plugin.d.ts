/**
 * ComprehensionPlugin — the reader's account of what they understood.
 *
 * The session loop already records what the reader *did*: which sections they
 * read, where they went back, where they gave up. This plugin contributes the
 * other half, the judgment a reader forms about the artifact itself — the term
 * that was never defined, the figure with no caption, the number with nothing
 * to compare against, the ending that asked for nothing.
 *
 * It runs at session end, once, over the whole artifact rather than per
 * percept, because comprehension is not a property of one screen: an acronym
 * is only undefined if the artifact never defines it *anywhere*, which is a
 * question you can only answer having seen all of it. The findings land in the
 * session through the ordinary plugin channel, so they are deduplicated,
 * scored into the `humanity.*` dimensions, and rendered in every report
 * exactly like an accessibility or performance finding.
 */
import type { EvePlugin, PluginContext } from "../plugins/plugin.js";
import type { HumanityAdapter } from "./adapter.js";
import { type ComprehensionAnalysis } from "./comprehension.js";
import type { Artifact } from "./types.js";
export declare class ComprehensionPlugin implements EvePlugin {
    private readonly source;
    readonly name = "comprehension";
    private analysis;
    /**
     * `source` is either the artifact itself or the adapter reading it. The
     * adapter form is the normal one: the artifact does not exist until
     * `open()` has run, which is after plugins are registered.
     */
    constructor(source: Artifact | HumanityAdapter);
    onRegister(): void;
    onSessionEnd(ctx: PluginContext): void;
    /** The analysis this plugin produced, once the session has ended. */
    result(): ComprehensionAnalysis | null;
    private resolveArtifact;
}
//# sourceMappingURL=plugin.d.ts.map