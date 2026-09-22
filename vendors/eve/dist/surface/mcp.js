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
import { ADAPTER_VERSION } from "../core/versions.js";
import { TEXTUAL_SURFACE } from "./capabilities.js";
import { connectMcpServer } from "./mcpClient.js";
import { LINE_HEIGHT, layoutTextFrame } from "./textFrame.js";
const DEFAULT_WINDOW_ROWS = 30;
const DEFAULT_CALL_TIMEOUT_MS = 10_000;
/**
 * Result text shown in the *deprecated web view* is truncated to what a user
 * would read at a glance. The kernel `tool-result` signal always carries the
 * full text and reports this truncation explicitly via `truncated`.
 */
const MAX_RESULT_LINES = 12;
/** Verbs this surface actuates natively (its kernel action registry). */
const MCP_ACTION_VERBS = ["mcp.invoke", "read", "wait"];
export class McpAdapter {
    name = "mcp";
    version = ADAPTER_VERSION;
    capabilities = { ...TEXTUAL_SURFACE, actionVerbs: MCP_ACTION_VERBS };
    connector;
    windowRows;
    callTimeoutMs;
    conn = null;
    target = "";
    openedAt = Date.now();
    tools = [];
    selected = null;
    lastResult = null;
    /** Most recent server notification (cleared when the operator next acts). */
    lastNotification = null;
    callInFlight = false;
    scrollLine = 0;
    constructor(options = {}) {
        this.connector = options.connector ?? connectMcpServer;
        this.windowRows = options.windowRows ?? DEFAULT_WINDOW_ROWS;
        this.callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    }
    /** Strip the `mcp:` scheme prefix; the remainder is the target. */
    static targetOf(url) {
        return url.startsWith("mcp:") ? url.slice(4) : url;
    }
    async open(url, _viewport) {
        this.target = McpAdapter.targetOf(url);
        await this.connect();
    }
    async connect() {
        await this.conn?.close().catch(() => { });
        this.conn = await this.connector(this.target);
        this.openedAt = Date.now();
        this.tools = await this.conn.listTools();
        this.selected = null;
        this.lastResult = null;
        this.lastNotification = null;
        this.scrollLine = 0;
        this.conn.onToolsChanged(() => {
            // The catalog changed under the operator — a kernel `notification`
            // signal plus a re-read with stable affordance identity (tool ids do
            // not shift when the list changes; they are names, not positions).
            this.lastNotification = "notifications/tools/list_changed";
            void this.refreshTools();
        });
    }
    async refreshTools() {
        if (!this.conn)
            return;
        this.tools = await this.conn.listTools();
        // If the selected tool vanished from the catalog, the operator is back
        // at the menu.
        if (this.selected && !this.tools.some((t) => t.name === this.selected?.name)) {
            this.selected = null;
        }
    }
    /* ---------------------------------------------------------------- */
    /* Frame construction (the deprecated web view)                      */
    /* ---------------------------------------------------------------- */
    buildFrame() {
        const lines = [];
        const affordances = [];
        const headingLines = [];
        const info = this.conn?.serverInfo;
        // Structural headers are headings: a human reads them as section
        // titles, and marking them as such gives the menu/form/result states
        // distinct screen identities (projection debt ledger item 5 — the three
        // states used to share one signature, so a successful call looked like
        // a dead click).
        headingLines.push(lines.length);
        lines.push(info
            ? `MCP server "${info.name}" v${info.version} — ${this.tools.length} tool(s)`
            : `MCP server at ${this.target} — ${this.tools.length} tool(s)`);
        lines.push("");
        if (this.selected === null) {
            // The affordance menu: one line per tool.
            if (this.tools.length === 0)
                lines.push("(this server advertises no tools)");
            for (const tool of this.tools) {
                const line = lines.length;
                const desc = tool.description?.trim() || "(no description)";
                lines.push(`  ${tool.name} — ${desc}`);
                affordances.push({
                    line,
                    column: 2,
                    text: tool.name,
                    role: "menuitem",
                    action: { kind: "selectTool", tool: tool.name },
                });
            }
        }
        else {
            // The "form": the selected tool's schema as fillable fields.
            const sel = this.selected;
            headingLines.push(lines.length);
            lines.push(`Tool: ${sel.name}`);
            if (sel.description)
                lines.push(sel.description);
            lines.push("");
            if (sel.fields.length === 0)
                lines.push("(this tool takes no arguments)");
            for (const field of sel.fields) {
                const line = lines.length;
                const value = sel.values.get(field.name) ?? "";
                const req = field.required ? ", required" : "";
                const echo = value ? ` = "${value}"` : "";
                lines.push(`  ${field.name} (${field.typeLabel}${req})${echo}${field.description ? ` — ${field.description}` : ""}`);
                affordances.push({
                    line,
                    column: 2,
                    text: field.name,
                    role: "textbox",
                    action: { kind: "focusField", field: field.name },
                });
            }
            lines.push("");
            const callLine = lines.length;
            const callText = `[call ${sel.name}]`;
            lines.push(this.callInFlight ? `calling ${sel.name}…` : callText);
            affordances.push({
                line: callLine,
                column: 0,
                text: this.callInFlight ? `calling ${sel.name}…` : callText,
                role: "button",
                action: { kind: "call" },
            });
            const menuLine = lines.length;
            lines.push("[back to tools]");
            affordances.push({
                line: menuLine,
                column: 0,
                text: "[back to tools]",
                role: "menuitem",
                action: { kind: "menu" },
            });
        }
        if (this.lastResult) {
            lines.push("");
            headingLines.push(lines.length);
            lines.push(this.lastResult.isError
                ? `--- error from ${this.lastResult.toolName} ---`
                : `--- result from ${this.lastResult.toolName} ---`);
            for (const line of this.lastResult.lines.slice(0, MAX_RESULT_LINES))
                lines.push(line);
        }
        return { lines, affordances, headingLines };
    }
    async snapshot() {
        const { lines, affordances, headingLines } = this.buildFrame();
        this.lastAffordances = affordances;
        const laid = layoutTextFrame({
            lines,
            affordances: affordances.map((a) => ({ line: a.line, column: a.column, text: a.text, role: a.role })),
            windowRows: this.windowRows,
            scrollLine: this.scrollLine,
        });
        const headings = new Set(headingLines);
        const elements = laid.elements.map((el) => {
            const line = Math.round(el.box.y / LINE_HEIGHT) + this.scrollLine;
            return el.role === "text" && headings.has(line) ? { ...el, role: "heading" } : el;
        });
        return {
            url: `mcp:${this.target}`,
            title: this.conn?.serverInfo?.name ?? this.target,
            viewport: laid.viewport,
            scrollY: laid.scrollY,
            scrollHeight: laid.scrollHeight,
            elements,
            // The deprecated web view's single "attention-demanding" slot: any
            // error (tool-level or protocol) becomes a fake modal dialog. The
            // kernel distinguishes them as typed signals; this metaphor survives
            // only for pre-kernel consumers.
            dialogs: this.lastResult?.isError
                ? [{ text: this.lastResult.lines[0] ?? "tool call failed", box: null }]
                : [],
            loadingIndicator: this.callInFlight,
        };
    }
    lastAffordances = [];
    async screenshot() {
        return null;
    }
    async moveMouse(_point) {
        // No pointer on a textual surface; cursor travel is not perceivable.
    }
    async clickAt(point) {
        const line = Math.floor(point.y / LINE_HEIGHT) + this.scrollLine;
        const target = this.lastAffordances.find((a) => a.line === line);
        if (!target)
            return;
        switch (target.action.kind) {
            case "selectTool":
                this.selectTool(target.action.tool);
                break;
            case "focusField":
                if (this.selected)
                    this.selected.focusedField = target.action.field;
                break;
            case "call":
                await this.invokeSelected();
                break;
            case "menu":
                this.selected = null;
                this.lastResult = null;
                this.scrollLine = 0;
                break;
        }
    }
    async doubleClickAt(point) {
        await this.clickAt(point);
    }
    selectTool(name) {
        const tool = this.tools.find((t) => t.name === name);
        if (!tool)
            return;
        this.selected = {
            name: tool.name,
            description: tool.description,
            fields: schemaFields(tool.inputSchema),
            values: new Map(),
            schema: tool.inputSchema,
            focusedField: null,
        };
        this.lastResult = null;
        this.scrollLine = 0;
    }
    async typeText(text, _perCharIntervalMs) {
        const sel = this.selected;
        if (!sel?.focusedField)
            return;
        sel.values.set(sel.focusedField, (sel.values.get(sel.focusedField) ?? "") + text);
    }
    async pressKey(key) {
        if (key === "Enter" && this.selected)
            await this.invokeSelected();
        if (key === "Escape")
            this.selected = null;
    }
    /** Submit the "form": call the selected tool with the filled arguments. */
    async invokeSelected() {
        const sel = this.selected;
        if (!sel || !this.conn || this.callInFlight)
            return;
        const args = {};
        for (const [field, raw] of sel.values) {
            args[field] = coerceArgument(raw, sel.schema, field);
        }
        await this.invokeTool(sel.name, args);
    }
    /* ---------------------------------------------------------------- */
    /* The kernel-native surface (Phase 2)                               */
    /* ---------------------------------------------------------------- */
    /**
     * Call a tool with already-typed arguments. No text coercion: argument
     * intent is a cognition-side decision (`synthesizeArguments`), the adapter
     * only actuates. Tool-level failures come back as error *results*;
     * protocol-level failures reject and are recorded as a distinct signal —
     * both are facts about the surface, never harness exceptions.
     */
    async invokeTool(name, args) {
        if (!this.conn || this.callInFlight)
            return;
        this.callInFlight = true;
        this.lastNotification = null;
        try {
            const outcome = await this.conn.callTool(name, args, this.callTimeoutMs);
            const text = outcome.text || (outcome.isError ? "(error)" : "(empty result)");
            this.lastResult = {
                toolName: name,
                isError: outcome.isError,
                protocolError: false,
                text,
                lines: splitLines(text),
            };
        }
        catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            this.lastResult = {
                toolName: name,
                isError: true,
                protocolError: true,
                text,
                lines: splitLines(text),
            };
        }
        finally {
            this.callInFlight = false;
        }
    }
    /**
     * The current operator-visible state, in kernel form: a structured
     * catalog (stable `tool:<name>` affordance identity, schemas and
     * annotations as perceived metadata) and typed signals instead of the
     * dialog metaphor.
     */
    async kernelPercept() {
        const { lines } = this.buildFrame();
        const affordances = this.tools.map((tool) => ({
            id: `tool:${tool.name}`,
            kind: "mcp.tool",
            locator: { kind: "schemaPath", path: `/tools/${tool.name}` },
            description: tool.description?.trim() || "(no description)",
            state: {
                enabled: !this.conn?.closed,
                metadata: {
                    inputSchema: tool.inputSchema,
                    ...(tool.annotations ? { annotations: tool.annotations } : {}),
                },
            },
        }));
        const signals = [];
        if (this.callInFlight)
            signals.push({ type: "loading", active: true });
        if (this.lastResult) {
            const r = this.lastResult;
            if (r.protocolError) {
                signals.push({ type: "error", text: r.text, source: "protocol" });
            }
            else {
                signals.push({
                    type: "tool-result",
                    tool: r.toolName,
                    isError: r.isError,
                    text: r.text,
                    // Faithful truncation semantics: the kernel carries the full text;
                    // this flag reports that the deprecated web view shortens it.
                    truncated: r.lines.length > MAX_RESULT_LINES,
                });
            }
        }
        if (this.lastNotification) {
            signals.push({ type: "notification", method: this.lastNotification });
        }
        if (this.conn?.closed) {
            // The surface itself ceased to exist — not a screen without affordances.
            signals.push({ type: "surface-terminated", reason: "the connection to the server closed" });
        }
        return {
            timestamp: Date.now() - this.openedAt,
            frame: {
                address: `mcp:${this.target}`,
                label: this.conn?.serverInfo?.name ?? this.target,
                surfaceState: this.selected ? "form" : this.lastResult ? "result" : "menu",
            },
            modality: "textual",
            lines,
            windowRows: this.windowRows,
            scrollLine: this.scrollLine,
            affordances,
            signals,
        };
    }
    /**
     * Perform one kernel-native action. A single `mcp.invoke` is a single
     * `tools/call` — never decomposed into form fill + Enter.
     */
    async actKernel(action) {
        if (action.verb !== "mcp.invoke") {
            throw new Error(`the MCP surface does not actuate verb "${action.verb}"`);
        }
        const payload = action.payload;
        if (typeof payload?.tool !== "string") {
            throw new Error("mcp.invoke requires a payload of { tool: string, arguments?: object }");
        }
        const args = typeof payload.arguments === "object" && payload.arguments !== null
            ? payload.arguments
            : {};
        await this.invokeTool(payload.tool, args);
    }
    async scrollBy(deltaY) {
        const { lines } = this.buildFrame();
        const next = this.scrollLine + Math.round(deltaY / LINE_HEIGHT);
        this.scrollLine = Math.max(0, Math.min(next, Math.max(0, lines.length - this.windowRows)));
    }
    async goBack() {
        // Unsupported: capabilities.canGoBack is false. The in-frame
        // "[back to tools]" affordance is the honest equivalent.
    }
    async navigate(url) {
        await this.open(url, { width: 0, height: 0 });
    }
    async close() {
        await this.conn?.close().catch(() => { });
        this.conn = null;
    }
}
/* -------------------------------------------------------------------- */
/* Schema → form projection                                              */
/* -------------------------------------------------------------------- */
function schemaFields(schema) {
    const properties = schema.properties;
    if (typeof properties !== "object" || properties === null)
        return [];
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const fields = [];
    for (const [name, rawProp] of Object.entries(properties)) {
        const prop = typeof rawProp === "object" && rawProp !== null ? rawProp : {};
        const record = prop;
        fields.push({
            name,
            typeLabel: typeLabelOf(record),
            required: required.has(name),
            description: typeof record.description === "string" ? record.description : undefined,
        });
    }
    return fields;
}
function typeLabelOf(schema) {
    if (typeof schema.type === "string")
        return schema.type;
    if (Array.isArray(schema.enum))
        return "enum";
    if (schema.anyOf || schema.oneOf)
        return "union";
    return "any";
}
/**
 * Coerce the raw text an operator typed into a schema-typed argument.
 * Unparseable input is sent as-is — servers are expected to reject garbage,
 * and watching them do so is part of the evaluation.
 */
function coerceArgument(raw, schema, field) {
    const properties = schema.properties;
    const prop = (properties?.[field] ?? {});
    switch (prop.type) {
        case "number":
        case "integer": {
            const n = Number(raw);
            return Number.isNaN(n) ? raw : n;
        }
        case "boolean":
            if (raw === "true" || raw === "1")
                return true;
            if (raw === "false" || raw === "0")
                return false;
            return raw;
        case "object":
        case "array":
            try {
                return JSON.parse(raw);
            }
            catch {
                return raw;
            }
        default:
            return raw;
    }
}
function splitLines(text) {
    return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}
//# sourceMappingURL=mcp.js.map