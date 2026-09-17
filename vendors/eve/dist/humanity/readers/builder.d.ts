/**
 * Shared assembly for readers: accumulate blocks, group them into sections,
 * and mint stable block ids.
 *
 * Every reader faces the same two chores — "start a new section here" and
 * "append a block to whatever section is open" — and getting the section
 * bookkeeping subtly wrong in six places would silently corrupt reading
 * order, which is the one thing a document surface has instead of geometry.
 */
import type { Artifact, ArtifactBlock, ArtifactFormat, ArtifactGenre, BlockKind } from "../types.js";
export interface BlockInput {
    readonly kind: BlockKind;
    readonly text: string;
    readonly depth?: number;
    readonly table?: ArtifactBlock["table"];
    readonly metric?: ArtifactBlock["metric"];
    readonly figure?: ArtifactBlock["figure"];
    readonly reference?: string;
    readonly language?: string;
}
export declare class ArtifactBuilder {
    private readonly address;
    private readonly format;
    private genre;
    private readonly blocks;
    private readonly sections;
    private readonly meta;
    private title;
    constructor(address: string, format: ArtifactFormat, genre: ArtifactGenre);
    setGenre(genre: ArtifactGenre): void;
    setTitle(title: string): void;
    setMeta(key: string, value: string): void;
    /**
     * Open a new section. Sections are the unit a reader turns between — a
     * chapter, a slide, a dashboard panel — so an empty one is never opened
     * speculatively: the current section is reused until something lands in it.
     */
    startSection(title: string): void;
    /**
     * Name the open section if it does not have a title yet. Slides are cut by
     * their separator, so the heading that follows the cut is what names them.
     */
    nameCurrentSection(title: string): void;
    add(block: BlockInput): void;
    /** How many blocks have been added so far (readers use it for lookahead). */
    get size(): number;
    /** The title so far — set explicitly, or derived from the address. */
    get currentTitle(): string;
    build(): Artifact;
}
//# sourceMappingURL=builder.d.ts.map