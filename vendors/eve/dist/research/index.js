/**
 * Research Mode — export complete, reproducible research datasets from a
 * population study (JSON snapshot, operator-level CSV, Markdown report).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { safeJoin } from "../core/security.js";
import { renderOperatorCsv, renderStudyJson, renderStudyMarkdown } from "./dataset.js";
export { renderOperatorCsv, renderStudy, renderStudyJson, renderStudyMarkdown, } from "./dataset.js";
/**
 * Write a study to `outputDir` in all three research formats:
 * `study.json`, `operators.csv`, and `study.md`. Returns the file paths.
 */
export async function writeStudyDataset(study, outputDir) {
    await mkdir(outputDir, { recursive: true });
    // Fixed filenames under a traversal-checked dir (P1.12) — study labels
    // and URLs never become path segments.
    const jsonPath = safeJoin(outputDir, "study.json");
    const csvPath = safeJoin(outputDir, "operators.csv");
    const mdPath = safeJoin(outputDir, "study.md");
    await writeFile(jsonPath, renderStudyJson(study), "utf8");
    await writeFile(csvPath, renderOperatorCsv(study), "utf8");
    await writeFile(mdPath, renderStudyMarkdown(study), "utf8");
    return { json: jsonPath, csv: csvPath, markdown: mdPath };
}
//# sourceMappingURL=index.js.map