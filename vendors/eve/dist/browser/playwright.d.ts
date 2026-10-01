import type { Point, Viewport } from "../core/types.js";
import type { AdapterOptions, BrowserAdapter, RawSnapshot } from "./adapter.js";
export declare class PlaywrightAdapter implements BrowserAdapter {
    readonly name = "playwright";
    readonly version = "0.5.0";
    readonly capabilities: import("../surface/capabilities.js").SurfaceCapabilities;
    private browser;
    private page;
    private pendingNativeDialogs;
    private readonly options;
    constructor(options?: AdapterOptions);
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
     * Give an action that may navigate a moment to commit.
     *
     * A driver click resolves once the input event is dispatched, which is
     * before any resulting navigation starts. Perceiving immediately would
     * capture the *old* page and report it as the outcome of the click. This
     * pause lets the new document begin loading, so `document.readyState`
     * turns the percept's loading indicator on and the observer waits it out
     * the way a human waits for a page to appear.
     */
    private settle;
}
//# sourceMappingURL=playwright.d.ts.map