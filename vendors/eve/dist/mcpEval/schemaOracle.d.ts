/**
 * Schema oracle — deterministic checks over the tools a server advertises.
 *
 * Pure function, no I/O: given the `tools/list` payload, find schema defects
 * a client would trip over. Checks cover three families:
 *
 * 1. **JSON Schema correctness** — the input schema must be an object schema
 *    whose `required` entries exist in `properties`, and each property must
 *    be a describable schema.
 * 2. **Description quality** — a tool with no description (or one that just
 *    restates its name) is un-navigable for agents and humans alike; the
 *    MCP spec itself pushes descriptive metadata as the discovery channel.
 * 3. **Annotation honesty** — name/annotation mismatches (`delete_*` with
 *    `destructiveHint: false`, `get_*` with `readOnlyHint: false`) mislead
 *    clients that gate calls on annotations.
 *
 * The tool shape is the advertised-wire shape, not the SDK's validated
 * `Tool` type: a *broken* server can advertise malformed schemas, and
 * catching exactly that is this oracle's job.
 */
import type { McpFinding } from "./types.js";
/** A tool as advertised on the wire (possibly malformed — that's the point). */
export interface AdvertisedTool {
    readonly name?: unknown;
    readonly description?: unknown;
    readonly inputSchema?: unknown;
    readonly annotations?: unknown;
}
/** Reset the finding-id counter (tests; ids are per-run otherwise). */
export declare function resetFindingIds(): void;
export declare function makeFinding(finding: Omit<McpFinding, "id">): McpFinding;
/** Check every advertised tool; return evidence-backed findings. */
export declare function checkToolSchemas(tools: readonly AdvertisedTool[]): McpFinding[];
//# sourceMappingURL=schemaOracle.d.ts.map