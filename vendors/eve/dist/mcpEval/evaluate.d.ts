/**
 * The MCP evaluation entry point: connect to a server, run the Phase-1
 * tier-1 (deterministic) oracles, and produce an evidence-backed report.
 *
 * Oracle mix (see `docs/mcp-adapter.md`):
 * - schema oracle   → `mcp.schemaQuality`   (no calls; pure advertisement checks)
 * - conformance     → `mcp.conformance`     (handshake, capabilities, ping, error codes)
 * - fuzz oracle     → `mcp.robustness`      (seeded adversarial inputs, crash/hang classification)
 *
 * Scoring follows the scorer's philosophy — derived measurements, never
 * vibes: each dimension starts at 100 and is deducted per finding severity
 * (critical 25 / major 12 / minor 4 / info 1, the same schedule the session
 * scorer uses), with the driving findings cited as evidence.
 */
import { type McpConnector } from "../surface/mcpClient.js";
import { type FuzzOptions } from "./fuzzOracle.js";
import { type McpEvalReport } from "./types.js";
export interface EvaluateMcpOptions {
    /** Override the transport (tests inject an in-process fixture server). */
    readonly connector?: McpConnector;
    /** Fuzzing is on by default; pass false to skip, or options to tune it. */
    readonly fuzz?: boolean | FuzzOptions;
}
/**
 * Evaluate one MCP server and return the full report. The connection is
 * always closed before returning, including on oracle failure.
 *
 * Target forms: `node server.js --flag` (stdio), `http(s)://…` (HTTP), or
 * anything accepted by the injected connector. An `mcp:` scheme prefix is
 * stripped if present.
 */
export declare function evaluateMcpServer(target: string, options?: EvaluateMcpOptions): Promise<McpEvalReport>;
/** Render the report as Markdown (CLI output and CI logs). */
export declare function renderMcpEvalMarkdown(report: McpEvalReport): string;
//# sourceMappingURL=evaluate.d.ts.map