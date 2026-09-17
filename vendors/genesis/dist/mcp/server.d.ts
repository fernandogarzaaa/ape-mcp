/**
 * Genesis MCP server: use the evaluation & assurance platform from any
 * MCP-compatible agent (Claude Code, Codex, opencode, Hermes, ...).
 *
 * stdio transport (`genesis mcp`). Every tool wraps the same pure modules
 * the CLI uses; nothing here executes anything the CLI could not. Long
 * evaluations can exceed client timeouts — prefer small specs or run the
 * CLI directly for large suites.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function createMcpServer(): McpServer;
/** stdio entrypoint for `genesis mcp`. Never writes to stdout except protocol. */
export declare function runMcpServer(): Promise<void>;
//# sourceMappingURL=server.d.ts.map