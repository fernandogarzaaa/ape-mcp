/**
 * McpAdapter — perceives an MCP server as a textual surface.
 *
 * **Phase 2: kernel-native.** The adapter's source of truth is the
 * modality-variant kernel (`src/core/kernel.ts`): a structured tool catalog
 * with stable affordance identity, typed surface signals (tool results,
 * protocol errors, notifications, termination), and a single `mcp.invoke`
 * kernel action carrying typed arguments. The legacy browser-flavored
 * snapshot below is now the *deprecated web view*, derived from the same
 * state for pre-kernel consumers:
 *
 * | Kernel concept      | MCP native                    | Deprecated web view          |
 * | ------------------- | ----------------------------- | ---------------------------- |
 * | frame identity      | address `mcp:<target>`, label | `url` / `title`              |
 * | affordances         | `mcp.tool` (schemaPath)       | menu lines (char cells)      |
 * | tool result         | `tool-result` signal (full)   | truncated frame lines        |
 * | tool/protocol error | `error` / `tool-result`       | a fake modal "dialog"        |
 * | `list_changed`      | `notification` signal         | a re-rendered frame          |
 * | `tools/call`        | one `mcp.invoke` action       | form fill + Enter            |
 *
 * Everything the adapter perceives is something a legitimate MCP client user
 * could see: the advertised catalog, the schemas, and the results of calls
 * they made. Server internals, logs and source stay out of bounds, exactly
 * as with the browser adapters.
 *
 * The Phase-1 projection strains this retires are logged in
 * `docs/projection-debt-ledger.md` (items 1–6); the web view is kept for
 * compatibility, warts included.
 */
import type { BrowserAdapter, KernelSurface, RawSnapshot } from "../browser/adapter.js";
import type { KernelAction, TextualKernelPercept } from "../core/kernel.js";
import type { Point, Viewport } from "../core/types.js";
import { type McpConnector } from "./mcpClient.js";
export interface McpAdapterOptions {
    /** Override the transport (tests inject an in-process fixture server). */
    readonly connector?: McpConnector;
    readonly windowRows?: number;
    readonly callTimeoutMs?: number;
}
export declare class McpAdapter implements BrowserAdapter, KernelSurface {
    readonly name = "mcp";
    readonly capabilities: {
        spatial: boolean;
        modality: import("../core/registry.js").Modality;
        canScreenshot: boolean;
        canGoBack: boolean;
        canScroll: boolean;
        pointer: "mouse" | "touch";
        canHover: boolean;
        actionVerbs: readonly ["mcp.invoke", "read", "wait"];
    };
    private readonly connector;
    private readonly windowRows;
    private readonly callTimeoutMs;
    private conn;
    private target;
    private openedAt;
    private tools;
    private selected;
    private lastResult;
    /** Most recent server notification (cleared when the operator next acts). */
    private lastNotification;
    private callInFlight;
    private scrollLine;
    constructor(options?: McpAdapterOptions);
    /** Strip the `mcp:` scheme prefix; the remainder is the target. */
    static targetOf(url: string): string;
    open(url: string, _viewport: Viewport): Promise<void>;
    private connect;
    private refreshTools;
    private buildFrame;
    snapshot(): Promise<RawSnapshot>;
    private lastAffordances;
    screenshot(): Promise<Buffer | null>;
    moveMouse(_point: Point): Promise<void>;
    clickAt(point: Point): Promise<void>;
    doubleClickAt(point: Point): Promise<void>;
    private selectTool;
    typeText(text: string, _perCharIntervalMs: number): Promise<void>;
    pressKey(key: string): Promise<void>;
    /** Submit the "form": call the selected tool with the filled arguments. */
    private invokeSelected;
    /**
     * Call a tool with already-typed arguments. No text coercion: argument
     * intent is a cognition-side decision (`synthesizeArguments`), the adapter
     * only actuates. Tool-level failures come back as error *results*;
     * protocol-level failures reject and are recorded as a distinct signal —
     * both are facts about the surface, never harness exceptions.
     */
    private invokeTool;
    /**
     * The current operator-visible state, in kernel form: a structured
     * catalog (stable `tool:<name>` affordance identity, schemas and
     * annotations as perceived metadata) and typed signals instead of the
     * dialog metaphor.
     */
    kernelPercept(): Promise<TextualKernelPercept>;
    /**
     * Perform one kernel-native action. A single `mcp.invoke` is a single
     * `tools/call` — never decomposed into form fill + Enter.
     */
    actKernel(action: KernelAction): Promise<void>;
    scrollBy(deltaY: number): Promise<void>;
    goBack(): Promise<void>;
    navigate(url: string): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=mcp.d.ts.map