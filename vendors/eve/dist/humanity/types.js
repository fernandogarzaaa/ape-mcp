/**
 * The artifact model — what a *digital output* looks like to a reader.
 *
 * EVE's adapters have always perceived surfaces an operator **drives**: a
 * page, a phone screen, a terminal, a tool catalog. But most of what software
 * puts in front of people is not driven at all — it is *read*. A quarterly
 * report. A pitch deck. An analytics export. A `--help` screen. A stack
 * trace. An API response someone has to make sense of at 2am. Those artifacts
 * succeed or fail for human reasons — the term nobody defined, the number
 * with no baseline, the slide with forty words on it — and until now EVE had
 * no way to sit down and read one.
 *
 * `Artifact` is the format-agnostic thing every reader produces: an ordered
 * sequence of {@link ArtifactBlock}s grouped into {@link ArtifactSection}s.
 * Markdown, HTML, a deck, a CSV, a JSON response and a terminal transcript
 * all land here, which is what lets one comprehension model and one
 * {@link ArtifactGenre}-aware set of expectations apply to all of them.
 *
 * The perception boundary holds exactly as it does for the browser adapters:
 * a reader perceives what the artifact puts on the page. Front matter that
 * renders is content; a build ID buried in a comment is not.
 */
/** The noun a genre uses for one section, for reports and percept labels. */
export function sectionNounFor(genre) {
    switch (genre) {
        case "presentation":
            return "slide";
        case "analytics":
            return "screen";
        case "data":
            return "record";
        case "transcript":
        case "document":
        case "interface":
            return "section";
    }
}
/** Words in a block, counted the way a reader consumes them. */
export function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
}
/** Total words in an artifact — how long the read is. */
export function artifactWordCount(artifact) {
    return artifact.blocks.reduce((total, block) => total + wordCount(block.text), 0);
}
//# sourceMappingURL=types.js.map