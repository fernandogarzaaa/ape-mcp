import { spawn } from "node:child_process";
import { detectAffordances, stripAnsi } from "./affordances.js";
import { TEXTUAL_SURFACE } from "./capabilities.js";
import { LINE_HEIGHT, layoutTextFrame } from "./textFrame.js";
const DEFAULT_WINDOW_ROWS = 24;
const SETTLE_MS = 50;
/** How long to wait with no new output before treating the process as
 * settled (e.g. an interactive prompt awaiting input) rather than waiting
 * indefinitely for it to exit. */
const INTERACTIVE_SETTLE_MS = 300;
/** Minimal shell-like tokenizer: honors single/double-quoted arguments. */
export function tokenizeCommand(command) {
    const tokens = [];
    const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match = pattern.exec(command);
    while (match !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
        match = pattern.exec(command);
    }
    return tokens;
}
/**
 * CliAdapter — perceives a command-line tool.
 *
 * For a terminal user, console output IS the screen. This adapter perceives
 * only what the process prints; it never inspects source, internals, or
 * network traffic.
 */
export class CliAdapter {
    options;
    name = "cli";
    capabilities = TEXTUAL_SURFACE;
    child = null;
    lines = [];
    affordances = [];
    command = "";
    scrollLine = 0;
    exited = false;
    windowRows;
    constructor(options = {}) {
        this.options = options;
        this.windowRows = options.windowRows ?? DEFAULT_WINDOW_ROWS;
    }
    async open(url, _viewport) {
        this.command = url.startsWith("cli:") ? url.slice(4) : url;
        await this.run(this.command);
    }
    run(command) {
        return new Promise((resolve, reject) => {
            this.child?.kill();
            const [bin, ...args] = tokenizeCommand(command);
            this.exited = false;
            this.lines = [];
            let child;
            try {
                child = spawn(bin, args, { cwd: this.options.cwd, shell: false });
            }
            catch (error) {
                reject(error);
                return;
            }
            this.child = child;
            let settled = false;
            let inactivityTimer = null;
            const finish = (fn) => {
                if (settled)
                    return;
                settled = true;
                if (inactivityTimer)
                    clearTimeout(inactivityTimer);
                fn();
            };
            // No new output for a while means either the process exited (handled
            // separately via 'close') or it is waiting on input, e.g. an
            // interactive prompt. Either way the operator can now perceive it.
            const resetInactivityTimer = () => {
                if (inactivityTimer)
                    clearTimeout(inactivityTimer);
                inactivityTimer = setTimeout(() => {
                    this.affordances = detectAffordances(this.lines);
                    finish(resolve);
                }, INTERACTIVE_SETTLE_MS);
            };
            const stdoutRef = { text: "" };
            const stderrRef = { text: "" };
            const absorb = (ref, chunk) => {
                ref.text += stripAnsi(chunk.toString("utf8"));
                const parts = ref.text.split(/\r?\n/);
                ref.text = parts.pop() ?? "";
                for (const line of parts)
                    this.lines.push(line);
                resetInactivityTimer();
            };
            child.stdout.on("data", (chunk) => absorb(stdoutRef, chunk));
            child.stderr.on("data", (chunk) => absorb(stderrRef, chunk));
            // A missing binary surfaces as an 'error' event, never as 'close'.
            child.on("error", (error) => finish(() => reject(error)));
            child.on("close", (code) => {
                this.exited = true;
                if (stdoutRef.text)
                    this.lines.push(stdoutRef.text);
                if (stderrRef.text)
                    this.lines.push(stderrRef.text);
                if (code !== 0 && code !== null) {
                    this.lines.push(`[process exited with code ${code}]`);
                }
                this.affordances = detectAffordances(this.lines);
                setTimeout(() => finish(resolve), SETTLE_MS);
            });
            resetInactivityTimer();
        });
    }
    async snapshot() {
        this.affordances = detectAffordances(this.lines);
        const laid = layoutTextFrame({
            lines: this.lines,
            affordances: this.affordances,
            windowRows: this.windowRows,
            scrollLine: this.scrollLine,
        });
        return {
            url: `cli:${this.command}`,
            title: this.command,
            viewport: laid.viewport,
            scrollY: laid.scrollY,
            scrollHeight: laid.scrollHeight,
            elements: laid.elements,
            dialogs: [],
            loadingIndicator: !this.exited,
        };
    }
    async screenshot() {
        return null;
    }
    async moveMouse(_point) {
        // A terminal has no pointer; cursor travel is not perceivable.
    }
    async clickAt(point) {
        // box.y is viewport-relative (per the adapter contract), so translate
        // back to an absolute line index using the current scroll offset.
        const line = Math.floor(point.y / LINE_HEIGHT) + this.scrollLine;
        const target = this.affordances.find((a) => a.line === line);
        if (target?.command)
            await this.run(target.command);
    }
    async doubleClickAt(point) {
        await this.clickAt(point);
    }
    async typeText(text, _perCharIntervalMs) {
        this.child?.stdin.write(text);
    }
    async pressKey(key) {
        if (key === "Enter")
            this.child?.stdin.write("\n");
    }
    async scrollBy(deltaY) {
        const next = this.scrollLine + Math.round(deltaY / LINE_HEIGHT);
        const maxScroll = Math.max(0, this.lines.length - this.windowRows);
        this.scrollLine = Math.max(0, Math.min(next, maxScroll));
    }
    async goBack() {
        // Unsupported: capabilities.canGoBack is false.
    }
    async navigate(url) {
        await this.open(url, { width: 0, height: 0 });
    }
    async close() {
        this.child?.kill();
        this.child = null;
    }
}
//# sourceMappingURL=cli.js.map