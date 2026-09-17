/**
 * HumanityAdapter — EVE sits down and reads.
 *
 * Every other adapter puts the operator in front of something they *drive*.
 * This one puts a reader in front of something they *receive*: a report, a
 * deck, a dashboard export, a `--help` screen, a stack trace, an API payload.
 * That is most of what software actually shows people, and until now EVE
 * could not experience any of it.
 *
 * **Kernel-native.** The adapter's source of truth is the document kernel
 * (`src/core/kernel.ts`): reading order as geometry, sections as the unit
 * the reader turns between, and typed signals for the two things that
 * genuinely happen while reading — reaching the end, and hitting something
 * you do not understand. The legacy browser-flavored snapshot is derived
 * from the same state, so every Phase-1 consumer (scoring, workflows,
 * reports, the session loop) works on a reading session unchanged.
 *
 * | Kernel concept   | Reading                              | Deprecated web view      |
 * | ---------------- | ------------------------------------ | ------------------------ |
 * | frame identity   | address + section title              | `url` / `title`          |
 * | affordances      | blocks, references, next/prev section | text lines + links       |
 * | comprehension    | `comprehension-gap` signal            | a fake modal "dialog"    |
 * | end of artifact  | `end-of-content` signal              | a final line of text     |
 * | reading position | section index + blocks read           | scroll offset            |
 *
 * The perception boundary is unchanged and, if anything, tighter: a reader
 * perceives the artifact's rendered content and nothing else. There is no
 * source, no file metadata, no build information — a person handed a PDF
 * cannot see who generated it either.
 */
import type { BrowserAdapter, KernelSurface, RawSnapshot } from "../browser/adapter.js";
import type { DocumentKernelPercept, KernelAction } from "../core/kernel.js";
import type { Point, Viewport } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
import type { Artifact, ArtifactFormat, ArtifactGenre } from "./types.js";
export interface HumanityAdapterOptions {
    /**
     * Read this artifact instead of loading one from the target. The
     * programmatic path — and how tests avoid touching the filesystem.
     */
    readonly artifact?: Artifact;
    /** Force a reader instead of letting detection choose. */
    readonly format?: ArtifactFormat;
    /** Force the genre instead of inferring it from content. */
    readonly genre?: ArtifactGenre;
    /**
     * The persona doing the reading. Comprehension is persona-relative — the
     * same paragraph loses a first-time user and not a specialist — so the
     * adapter needs it to know which gaps the reader actually perceives.
     * Defaults to the baseline reader; `EveSession` passes the real one.
     */
    readonly persona?: Persona;
    /** Milliseconds to wait on an http(s) target. */
    readonly timeoutMs?: number;
}
export declare class HumanityAdapter implements BrowserAdapter, KernelSurface {
    private readonly options;
    readonly name = "humanity";
    readonly capabilities: {
        spatial: boolean;
        modality: import("../core/registry.js").Modality;
        canScreenshot: boolean;
        canGoBack: boolean;
        canScroll: boolean;
        pointer: "mouse" | "touch";
        canHover: boolean;
        actionVerbs: readonly ["doc.skim", "doc.read", "doc.study", "doc.next", "doc.back", "doc.reread", "doc.follow", "read", "wait"];
    };
    private artifact;
    private persona;
    private section;
    private openedAt;
    private readonly sections;
    /** Sections visited, most recent last — the reader's way back. */
    private readonly trail;
    private comprehension;
    /** Gaps perceived on the current view; cleared when the reader moves. */
    private gaps;
    constructor(options?: HumanityAdapterOptions);
    /** Strip the `doc:` scheme; the remainder is the artifact's address. */
    static targetOf(url: string): string;
    /** The artifact currently open, for callers that want the model itself. */
    currentArtifact(): Artifact | null;
    /**
     * The line the reader sees at the end of the artifact. Exposed because
     * finishing a document is a real, perceivable outcome, and callers wire it
     * up as the session's goal success signal rather than having the reader
     * "abandon" a document they in fact finished.
     */
    endMarker(): string;
    /**
     * The reader. `EveSession` calls this through the optional
     * `attachOperator` hook before opening, so a session's persona is the one
     * whose comprehension the adapter reports.
     */
    attachOperator(persona: Persona): void;
    open(url: string, _viewport: Viewport): Promise<void>;
    /** Open an artifact already in memory, without touching the filesystem. */
    openArtifact(artifact: Artifact): void;
    kernelPercept(): Promise<DocumentKernelPercept>;
    /**
     * What a reader can act on here: the blocks worth stopping over, the
     * references that lead elsewhere, and the two ways out of the section.
     *
     * Prose paragraphs are not affordances — reading them is what `doc.read`
     * does to the whole section. A table, a figure and a metric *are*, because
     * stopping to work one out is a distinct act a reader chooses to take.
     */
    private affordances;
    actKernel(action: KernelAction): Promise<void>;
    snapshot(): Promise<RawSnapshot>;
    screenshot(): Promise<Buffer | null>;
    moveMouse(_point: Point): Promise<void>;
    /**
     * The legacy gesture path. A click on a document surface is the reader
     * stopping on whatever is at that position — which is `doc.study` — and a
     * click on a section marker is turning the page.
     */
    clickAt(point: Point): Promise<void>;
    doubleClickAt(point: Point): Promise<void>;
    typeText(_text: string, _perCharIntervalMs: number): Promise<void>;
    pressKey(key: string): Promise<void>;
    /** Scrolling past the end of a section turns to the next one. */
    scrollBy(deltaY: number): Promise<void>;
    goBack(): Promise<void>;
    navigate(url: string): Promise<void>;
    close(): Promise<void>;
    private requireArtifact;
    private recomputeComprehension;
    private stateFor;
    private blocksOf;
    private goTo;
    /** True when the reader has read the last section of the artifact. */
    /**
     * The reader has reached the end and consumed the last section — closely or
     * by skimming it. Skimming counts: someone who skims the last page still
     * knows the document is over, and requiring a close read here stranded
     * skimming personas on the final section, turning them back with `doc.next`
     * against a clamped index until they gave up.
     */
    private atEnd;
    /** True when the reader has been through every block of a section. */
    private isConsumed;
    /**
     * How much of the artifact the reader has been through — the numerator of
     * the progress a reader feels. A skimmed section counts in full: they have
     * moved past it, whatever they retained of it.
     */
    private blocksRead;
    /**
     * The gaps this reader perceives in a set of blocks they just read.
     *
     * Only genuinely lost blocks surface: a reader knows when they did not
     * follow something, but a paragraph they mostly got does not announce
     * itself. The threshold is what separates "that was dense" from "I have
     * no idea what that said".
     */
    private gapsFor;
    /** Resolve a cross-reference to a section index, when it points inside. */
    private resolveReference;
}
/** Read an artifact already in memory — the one-liner programmatic path. */
export declare function humanityAdapterFor(address: string, text: string, options?: Omit<HumanityAdapterOptions, "artifact">): HumanityAdapter;
//# sourceMappingURL=adapter.d.ts.map