/**
 * Shared assembly for readers: accumulate blocks, group them into sections,
 * and mint stable block ids.
 *
 * Every reader faces the same two chores — "start a new section here" and
 * "append a block to whatever section is open" — and getting the section
 * bookkeeping subtly wrong in six places would silently corrupt reading
 * order, which is the one thing a document surface has instead of geometry.
 */
import { sectionNounFor } from "../types.js";
export class ArtifactBuilder {
    address;
    format;
    genre;
    blocks = [];
    sections = [];
    meta = {};
    title = null;
    constructor(address, format, genre) {
        this.address = address;
        this.format = format;
        this.genre = genre;
    }
    setGenre(genre) {
        this.genre = genre;
    }
    setTitle(title) {
        if (!this.title && title.trim())
            this.title = title.trim();
    }
    setMeta(key, value) {
        this.meta[key] = value;
    }
    /**
     * Open a new section. Sections are the unit a reader turns between — a
     * chapter, a slide, a dashboard panel — so an empty one is never opened
     * speculatively: the current section is reused until something lands in it.
     */
    startSection(title) {
        const current = this.sections.at(-1);
        if (current && current.blocks.length === 0) {
            current.title = title || current.title;
            return;
        }
        this.sections.push({ title, blocks: [] });
    }
    /**
     * Name the open section if it does not have a title yet. Slides are cut by
     * their separator, so the heading that follows the cut is what names them.
     */
    nameCurrentSection(title) {
        const current = this.sections.at(-1);
        if (current && !current.title.trim())
            current.title = title;
    }
    add(block) {
        // `trimEnd`, not a `/\s+$/` replace: an end-anchored `+` retries from
        // every position in a long run of whitespace, so trimming one very long
        // line costs quadratic time. Blocks carry whatever the artifact had.
        const text = block.text.trimEnd();
        // A block with neither text nor structured content is not perceivable.
        if (!text.trim() && !block.table && !block.metric && !block.figure)
            return;
        if (this.sections.length === 0)
            this.sections.push({ title: "", blocks: [] });
        const sectionIndex = this.sections.length - 1;
        const index = this.blocks.length;
        this.blocks.push({
            id: `b${index}`,
            kind: block.kind,
            text,
            depth: block.depth ?? 0,
            section: sectionIndex,
            ...(block.table ? { table: block.table } : {}),
            ...(block.metric ? { metric: block.metric } : {}),
            ...(block.figure ? { figure: block.figure } : {}),
            ...(block.reference ? { reference: block.reference } : {}),
            ...(block.language ? { language: block.language } : {}),
        });
        this.sections[sectionIndex]?.blocks.push(index);
    }
    /** How many blocks have been added so far (readers use it for lookahead). */
    get size() {
        return this.blocks.length;
    }
    /** The title so far — set explicitly, or derived from the address. */
    get currentTitle() {
        return this.title ?? deriveTitle(this.address);
    }
    build() {
        const noun = sectionNounFor(this.genre);
        const sections = this.sections
            .filter((s) => s.blocks.length > 0)
            .map((s, index) => ({
            index,
            title: s.title.trim() || `${capitalize(noun)} ${index + 1}`,
            noun,
            blocks: s.blocks,
        }));
        // Filtering empty sections renumbers the survivors, so block→section
        // links are rewritten rather than left pointing at the old indices.
        const remap = new Map();
        sections.forEach((section, newIndex) => {
            for (const blockIndex of section.blocks)
                remap.set(blockIndex, newIndex);
        });
        const blocks = this.blocks.map((block, index) => ({
            ...block,
            section: remap.get(index) ?? 0,
        }));
        return {
            address: this.address,
            title: this.title ?? deriveTitle(this.address),
            format: this.format,
            genre: this.genre,
            sections: sections.length > 0 ? sections : [{ index: 0, title: "Empty", noun, blocks: [] }],
            blocks,
            meta: { ...this.meta },
        };
    }
}
function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}
/** Last path segment, minus extension — what a reader would call the thing. */
function deriveTitle(address) {
    const name = address.split(/[\\/]/).pop() ?? address;
    return name.replace(/\.[a-z0-9]+$/i, "") || address;
}
//# sourceMappingURL=builder.js.map