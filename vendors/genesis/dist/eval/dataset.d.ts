/**
 * Dataset abstraction: JSON, JSONL, CSV, YAML-subset, text, directories,
 * inline arrays. Every dataset is immutable: identity + version + digest +
 * schema + task count + provenance.
 */
import type { DatasetInfo, EvalTask } from "./types.js";
export interface LoadedDataset {
    readonly info: DatasetInfo;
    readonly tasks: readonly EvalTask[];
}
export declare class DatasetError extends Error {
    readonly name = "DatasetError";
}
export type DatasetFormat = "json" | "jsonl" | "csv" | "yaml" | "text" | "dir" | "auto";
export declare function loadDataset(input: {
    path?: string;
    inline?: readonly unknown[];
    stdin?: string;
    format?: DatasetFormat;
    id?: string;
    version?: string;
}): LoadedDataset;
export declare function fromRecords(records: readonly unknown[], id: string, version: string, provenance?: Record<string, unknown>): LoadedDataset;
//# sourceMappingURL=dataset.d.ts.map