import type { BrowserAdapter, RawSnapshot } from "../browser/adapter.js";
import type { Point, Viewport } from "../core/types.js";
/** Minimal shell-like tokenizer: honors single/double-quoted arguments. */
export declare function tokenizeCommand(command: string): string[];
export interface CliAdapterOptions {
    cwd?: string;
    windowRows?: number;
}
/**
 * CliAdapter — perceives a command-line tool.
 *
 * For a terminal user, console output IS the screen. This adapter perceives
 * only what the process prints; it never inspects source, internals, or
 * network traffic.
 */
export declare class CliAdapter implements BrowserAdapter {
    private readonly options;
    readonly name = "cli";
    readonly version = "0.5.0";
    readonly capabilities: import("./capabilities.js").SurfaceCapabilities;
    private child;
    private lines;
    private affordances;
    private command;
    private scrollLine;
    private exited;
    private readonly windowRows;
    constructor(options?: CliAdapterOptions);
    open(url: string, _viewport: Viewport): Promise<void>;
    private run;
    snapshot(): Promise<RawSnapshot>;
    screenshot(): Promise<Buffer | null>;
    moveMouse(_point: Point): Promise<void>;
    clickAt(point: Point): Promise<void>;
    doubleClickAt(point: Point): Promise<void>;
    typeText(text: string, _perCharIntervalMs: number): Promise<void>;
    pressKey(key: string): Promise<void>;
    scrollBy(deltaY: number): Promise<void>;
    goBack(): Promise<void>;
    navigate(url: string): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=cli.d.ts.map