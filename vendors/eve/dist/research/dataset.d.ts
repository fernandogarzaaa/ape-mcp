/**
 * Research-mode exporters — turn a {@link PopulationStudy} into reproducible,
 * shareable research artifacts: a machine-readable JSON snapshot, an
 * operator-level CSV dataset for statistical tools, and a human-readable
 * Markdown report. These are the building blocks of "Research Mode".
 */
import type { PopulationStudy } from "../population/population.js";
export type DatasetFormat = "json" | "csv" | "markdown";
/** Full study as pretty-printed JSON. */
export declare function renderStudyJson(study: PopulationStudy): string;
/**
 * One row per operator — the tidy dataset a researcher loads into pandas/R.
 * Emotion columns are pulled out of the nested `emotions` object.
 */
export declare function renderOperatorCsv(study: PopulationStudy): string;
/** A complete, human-readable study report. */
export declare function renderStudyMarkdown(study: PopulationStudy): string;
/** Render a study in the requested format. */
export declare function renderStudy(study: PopulationStudy, format: DatasetFormat): string;
//# sourceMappingURL=dataset.d.ts.map