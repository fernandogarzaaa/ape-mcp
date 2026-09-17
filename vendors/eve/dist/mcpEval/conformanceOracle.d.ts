/**
 * Conformance oracle — does the server honor the protocol basics?
 *
 * Deterministic checks over a live connection:
 *
 * 1. **Initialize handshake** — the connection established at all, and the
 *    server identified itself (name + version).
 * 2. **Capability declaration** — a server that answers `tools/list` must
 *    declare the `tools` capability at initialize; `listChanged` support is
 *    recorded for the report (it is optional, so never a finding).
 * 3. **Ping** — the liveness method must be answered.
 * 4. **Error codes** — calling a nonexistent tool must produce a JSON-RPC
 *    protocol error (-32602 invalid params, or -32601 method not found on
 *    older servers), not a fake success and not a crash.
 */
import { type McpConnection } from "../surface/mcpClient.js";
import type { McpFinding } from "./types.js";
export interface ConformanceResult {
    readonly findings: McpFinding[];
    /** null = the server declared no `tools` capability at all. */
    readonly listChanged: boolean | null;
}
export declare function checkConformance(conn: McpConnection): Promise<ConformanceResult>;
//# sourceMappingURL=conformanceOracle.d.ts.map