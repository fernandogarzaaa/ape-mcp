/**
 * Research Mode — export complete, reproducible research datasets from a
 * population study (JSON snapshot, operator-level CSV, Markdown report).
 */
import type { PopulationStudy } from "../population/population.js";
export { type DatasetFormat, renderOperatorCsv, renderStudy, renderStudyJson, renderStudyMarkdown, } from "./dataset.js";
export interface WrittenDataset {
    readonly json: string;
    readonly csv: string;
    readonly markdown: string;
}
/**
 * Write a study to `outputDir` in all three research formats:
 * `study.json`, `operators.csv`, and `study.md`. Returns the file paths.
 */
export declare function writeStudyDataset(study: PopulationStudy, outputDir: string): Promise<WrittenDataset>;
//# sourceMappingURL=index.d.ts.map