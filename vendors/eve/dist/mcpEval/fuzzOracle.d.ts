/**
 * Fuzz oracle — deterministic robustness probing of tool inputs.
 *
 * Generates a small, seeded set of adversarial argument sets per tool —
 * type violations, missing required fields, boundary values and one
 * oversized payload — calls the tool with each, and classifies what comes
 * back:
 *
 * | Outcome           | Meaning                                              |
 * | ----------------- | ---------------------------------------------------- |
 * | `protocol-error`  | JSON-RPC error (e.g. -32602) — the correct rejection |
 * | `error-result`    | tool-level `isError` result — acceptable rejection   |
 * | `accepted`        | garbage accepted without complaint — a finding     |
 * | `hang`            | no response within the call timeout — a finding    |
 * | `crash`           | the transport died — critical; fuzzing stops       |
 *
 * Determinism: case selection flows through the session `Rng`, so a report
 * is reproducible from its seed, like every other EVE artifact.
 */
import { type McpConnection } from "../surface/mcpClient.js";
import type { AdvertisedTool } from "./schemaOracle.js";
import type { FuzzStats, McpFinding } from "./types.js";
export interface FuzzOptions {
    /** Max adversarial cases per tool (default 6). */
    readonly perTool?: number;
    /** Per-call timeout in ms (default 5000). */
    readonly timeoutMs?: number;
    /** Oversized payload size in characters (default 65536). */
    readonly maxPayloadChars?: number;
    /** Seed for case selection (default 1). */
    readonly seed?: number | string;
}
export interface FuzzResult {
    readonly findings: McpFinding[];
    readonly stats: FuzzStats;
}
/**
 * Fuzz every advertised tool. Stops early if the server crashes — a dead
 * transport cannot answer further calls, and one crash is already the
 * headline finding.
 */
export declare function fuzzTools(conn: McpConnection, tools: readonly AdvertisedTool[], options?: FuzzOptions): Promise<FuzzResult>;
//# sourceMappingURL=fuzzOracle.d.ts.map