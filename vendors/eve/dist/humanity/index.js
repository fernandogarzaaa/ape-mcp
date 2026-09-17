/**
 * The humanity seam — EVE reads.
 *
 * Every other adapter puts the operator in front of something they drive.
 * This one puts a reader in front of a *digital output*: a report, a deck, an
 * analytics export, a `--help` screen, a stack trace, an API payload — the
 * artifacts software produces that nobody clicks and everybody has to
 * understand. See `docs/humanity-adapter.md`.
 */
export { HumanityAdapter, humanityAdapterFor } from "./adapter.js";
export { analyzeComprehension, comprehendBlock, } from "./comprehension.js";
export { ComprehensionPlugin } from "./plugin.js";
export { readArtifact, readLoadedArtifact, readText } from "./read.js";
export { countSyllables, findAcronyms, findJargon, jargonVocabulary, measureReadability, splitSentences, } from "./readability.js";
export { ArtifactBuilder, listReaders, parseMetric, readArtifactText, readDelimited, readHtml, readJson, readMarkdown, readText as readPlainText, readTranscript, readYaml, selectReader, } from "./readers/index.js";
export { renderComprehensionMarkdown } from "./report.js";
export { artifactFromText, DOC_SCHEME, docTargetOf, loadArtifact } from "./source.js";
export { artifactWordCount, sectionNounFor, wordCount } from "./types.js";
export { HUMANITY_DIMENSIONS, registerHumanityVocabulary, } from "./vocabulary.js";
//# sourceMappingURL=index.js.map