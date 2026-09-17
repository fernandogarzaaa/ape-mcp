/**
 * Reading reports.
 *
 * The session's own HTML/Markdown/JSON reports already render a reading
 * session — findings, scores, the journal, the emotion timeline — because a
 * reading session is an ordinary session. What they cannot show is the thing
 * specific to reading: where in the artifact this reader's understanding
 * fell away. That is what this adds.
 */
import type { ComprehensionAnalysis } from "./comprehension.js";
import type { Artifact } from "./types.js";
/**
 * Render the comprehension analysis as Markdown.
 *
 * Ordered the way the reader met the artifact — the verdict, then where
 * understanding broke down, then the evidence — rather than by severity,
 * because "which part lost me" is the question a writer is actually asking.
 */
export declare function renderComprehensionMarkdown(analysis: ComprehensionAnalysis, artifact: Artifact): string;
//# sourceMappingURL=report.d.ts.map