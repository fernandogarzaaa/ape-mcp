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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, McpError, ToolListChangedNotificationSchema, } from "@modelcontextprotocol/sdk/types.js";
import { tokenizeCommand } from "./cli.js";
const CLIENT_INFO = { name: "eve-mcp-evaluator", version: "0.1.0" };
const DEFAULT_CALL_TIMEOUT_MS = 10_000;
/** {@link McpConnection} over the official SDK client. */
class SdkMcpConnection {
    target;
    client;
    isClosed = false;
    constructor(target, transport) {
        this.target = target;
        this.client = new Client(CLIENT_INFO, { capabilities: {} });
        this.client.onclose = () => {
            this.isClosed = true;
        };
        // connect() runs the initialize handshake; a target that never answers
        // rejects here, which callers surface as a setup failure (the operator
        // never reached a surface), not a UX finding.
        this.connectPromise = this.client.connect(transport);
    }
    connectPromise;
    static async open(target, transport) {
        const conn = new SdkMcpConnection(target, transport);
        await conn.connectPromise;
        return conn;
    }
    get serverInfo() {
        return this.client.getServerVersion();
    }
    get serverCapabilities() {
        return this.client.getServerCapabilities();
    }
    get closed() {
        return this.isClosed;
    }
    async listTools() {
        const result = await this.client.listTools();
        return result.tools;
    }
    async callTool(name, args, timeoutMs = DEFAULT_CALL_TIMEOUT_MS) {
        const result = await this.client.callTool({ name, arguments: args }, CallToolResultSchema, {
            timeout: timeoutMs,
        });
        return flattenResult(result);
    }
    onToolsChanged(handler) {
        this.client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
            handler();
        });
    }
    async ping() {
        await this.client.ping();
    }
    async close() {
        try {
            await this.client.close();
        }
        finally {
            this.isClosed = true;
        }
    }
}
/** Reduce a tool result to what an operator could actually read. */
function flattenResult(result) {
    const parts = [];
    for (const block of result.content ?? []) {
        if (block.type === "text")
            parts.push(block.text);
        else
            parts.push(`[${block.type} content]`);
    }
    const structured = result.structuredContent;
    return {
        isError: result.isError === true,
        text: parts.join("\n"),
        ...(structured !== undefined ? { structured } : {}),
    };
}
/**
 * Connect to an MCP server target.
 *
 * TRUST BOUNDARY (P1.12): a non-HTTP target SPAWNS A LOCAL PROCESS with the
 * caller's environment — execute-with-user-authorized-code semantics, NOT
 * safe-by-default evaluation. Only connect to commands the operator
 * explicitly authorized (config file, CLI flag). Tokenization never uses a
 * shell; stderr is inherited for debuggability (protocol failures stay
 * distinguishable from server diagnostics); callers should impose their own
 * timeouts and process cleanup via the returned connection's `close()`.
 *
 * Target forms (after any `mcp:` scheme prefix has been stripped):
 * - `http://…` / `https://…` → Streamable HTTP transport
 * - anything else → a command line spawned over stdio
 */
export async function connectMcpServer(target) {
    if (/^https?:\/\//.test(target)) {
        return SdkMcpConnection.open(target, new StreamableHTTPClientTransport(new URL(target)));
    }
    const [command, ...args] = tokenizeCommand(target);
    if (!command)
        throw new Error(`empty MCP target command in "${target}"`);
    return SdkMcpConnection.open(target, new StdioClientTransport({
        command,
        args,
        // The server's stderr is its diagnostics channel, not protocol; inherit
        // it so a crashing target stays debuggable.
        stderr: "inherit",
    }));
}
/**
 * Connect to an MCP server running in the same process (an SDK `Server`
 * instance). This is how tests evaluate fixture servers without spawning
 * anything — and how EVE can evaluate *itself* (`createServer()` from
 * `src/mcp/server.ts`) as the ultimate dogfood.
 */
export async function connectMcpInProcess(server, target = "in-process") {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    return SdkMcpConnection.open(target, clientTransport);
}
/** JSON-RPC error codes the evaluators classify on. */
export { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
/** Is this error the transport dying underneath a call (a server crash)? */
export function isConnectionClosedError(error) {
    return error instanceof McpError && error.message.includes("Connection closed");
}
/** Is this error the client giving up on an unanswered request (a hang)? */
export function isTimeoutError(error) {
    return error instanceof McpError && error.message.includes("timed out");
}
//# sourceMappingURL=mcpClient.js.map