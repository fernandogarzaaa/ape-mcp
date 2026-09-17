/**
 * MCP client connector — the transport layer for evaluating MCP servers.
 *
 * EVE *is* an MCP server (`src/mcp/`), so the official SDK is already a
 * runtime dependency; this module uses its client half to connect to a
 * *target* server. Two transports are supported:
 *
 * - stdio (`node server.js --flag`, the must-have): the target is spawned as
 *   a subprocess, exactly how MCP hosts launch servers.
 * - Streamable HTTP (`http://` / `https://` URLs): for servers that are
 *   already running.
 *
 * Everything here is a *client of the subject under evaluation* — it is the
 * evaluation equivalent of the browser driver, not a privileged channel.
 * The {@link McpConnection} interface is deliberately narrow so tests can
 * substitute an in-process fixture server over `InMemoryTransport` without
 * spawning anything.
 */
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { type Implementation, type ServerCapabilities, type Tool } from "@modelcontextprotocol/sdk/types.js";
/** How a tool call ended, flattened to what an operator could perceive. */
export interface McpCallOutcome {
    /** The server answered with a tool-level error result (`isError: true`). */
    readonly isError: boolean;
    /** Concatenated text content — what a user of the tool would read. */
    readonly text: string;
    /** Structured content, when the tool returned any. */
    readonly structured?: unknown;
}
/**
 * A live connection to the MCP server under evaluation. Narrow on purpose:
 * adapters and oracles need tools/list, tools/call, ping and close — nothing
 * else. Tests implement this against an in-process fixture server.
 */
export interface McpConnection {
    /** The target string the connection was opened for (for reporting). */
    readonly target: string;
    /** Server identity from the initialize handshake, once connected. */
    readonly serverInfo: Implementation | undefined;
    /** Capabilities the server declared at initialize. */
    readonly serverCapabilities: ServerCapabilities | undefined;
    /** True after the transport has closed (server exit, crash, kill). */
    readonly closed: boolean;
    listTools(): Promise<readonly Tool[]>;
    /**
     * Call a tool. Tool-level failures come back as `isError` outcomes;
     * protocol-level failures (invalid params, unknown method, timeout,
     * connection loss) reject — the oracles classify on that distinction.
     */
    callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<McpCallOutcome>;
    /** Subscribe to `notifications/tools/list_changed`. */
    onToolsChanged(handler: () => void): void;
    ping(): Promise<void>;
    close(): Promise<void>;
}
/** A function that opens a connection to a target. Injectable for tests. */
export type McpConnector = (target: string) => Promise<McpConnection>;
/**
 * Connect to an MCP server target.
 *
 * Target forms (after any `mcp:` scheme prefix has been stripped):
 * - `http://…` / `https://…` → Streamable HTTP transport
 * - anything else → a command line spawned over stdio
 */
export declare function connectMcpServer(target: string): Promise<McpConnection>;
/**
 * Connect to an MCP server running in the same process (an SDK `Server`
 * instance). This is how tests evaluate fixture servers without spawning
 * anything — and how EVE can evaluate *itself* (`createServer()` from
 * `src/mcp/server.ts`) as the ultimate dogfood.
 */
export declare function connectMcpInProcess(server: Server, target?: string): Promise<McpConnection>;
/** JSON-RPC error codes the evaluators classify on. */
export { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
/** Is this error the transport dying underneath a call (a server crash)? */
export declare function isConnectionClosedError(error: unknown): boolean;
/** Is this error the client giving up on an unanswered request (a hang)? */
export declare function isTimeoutError(error: unknown): boolean;
//# sourceMappingURL=mcpClient.d.ts.map