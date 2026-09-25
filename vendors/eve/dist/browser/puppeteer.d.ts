import type { Point, Viewport } from "../core/types.js";
import type { AdapterOptions, BrowserAdapter, RawSnapshot } from "./adapter.js";
export declare class PuppeteerAdapter implements BrowserAdapter {
    readonly name = "puppeteer";
    readonly version = "0.5.0";
    readonly capabilities: import("../surface/capabilities.js").SurfaceCapabilities;
    private browser;
    private page;
    private pendingNativeDialogs;
    private readonly options;
    private readonly launchArgs;
    /**
     * `args` is a launch-flags escape hatch, not a general option — a real
     * user's machine has a working Chrome sandbox and should never need it. It
     * exists for environments like a root-run container or a hardened CI
     * runner image, where the sandbox helper isn't usable and Chrome refuses
     * to start at all without `--no-sandbox`.
     */
    constructor(options?: AdapterOptions & {
        args?: readonly string[];
    });
    open(url: string, viewport: Viewport): Promise<void>;
    snapshot(): Promise<RawSnapshot>;
    screenshot(): Promise<Buffer | null>;
    moveMouse(point: Point): Promise<void>;
    clickAt(point: Point): Promise<void>;
    doubleClickAt(point: Point): Promise<void>;
    typeText(text: string, perCharIntervalMs: number): Promise<void>;
    pressKey(key: string): Promise<void>;
    scrollBy(deltaY: number): Promise<void>;
    goBack(): Promise<void>;
    navigate(url: string): Promise<void>;
    close(): Promise<void>;
    private requirePage;
    /**
     * Give an action that may navigate a moment to commit. See the identical
     * note on `PlaywrightAdapter.settle` — the two adapters must behave the
     * same or the cognition engine could tell them apart.
     */
    private settle;
}
//# sourceMappingURL=puppeteer.d.ts.map