/**
 * EVE MCP server (`eve-mcp-server`).
 *
 * Exposes the Experience Validation Engine as Model Context Protocol tools so
 * it can be driven from any MCP-capable AI client — Claude Desktop, Claude
 * Code, Codex, Cursor, Windsurf, VS Code, and others. Uses the stdio transport
 * (the client launches this as a subprocess), so nothing is ever written to
 * stdout except the MCP protocol itself; diagnostics go to stderr.
 *
 * Run directly with `eve-mcp` (see bin/eve-mcp.js) or `node dist/mcp/server.js`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function createServer(): McpServer;
/** Start the server over stdio. */
export declare function main(): Promise<void>;
//# sourceMappingURL=server.d.ts.map