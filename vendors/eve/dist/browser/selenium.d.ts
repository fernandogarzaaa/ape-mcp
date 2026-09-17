import type { Point, Viewport } from "../core/types.js";
import type { AdapterOptions, BrowserAdapter, RawSnapshot } from "./adapter.js";
export declare class SeleniumAdapter implements BrowserAdapter {
    readonly name = "selenium";
    readonly capabilities: import("../surface/capabilities.js").SurfaceCapabilities;
    private driver;
    private origin;
    private keyMap;
    private readonly options;
    private readonly browserName;
    private readonly launchArgs;
    private readonly chromeBinaryPath;
    private readonly chromedriverPath;
    /**
     * `args`, `chromeBinaryPath` and `chromedriverPath` are escape hatches, not
     * general options — a real user's machine has a working Chrome sandbox and
     * a correctly matched chromedriver on PATH (or lets Selenium Manager
     * resolve one) and should never need any of them.
     *
     * `chromeBinaryPath`/`chromedriverPath` exist because PATH-based resolution
     * is unreliable in exactly the environments this most needs to work in: a
     * CI image or dev container can have *any* pre-existing chromedriver on
     * PATH (a leftover from base-image tooling, a different project's install)
     * that outranks Selenium Manager's own version-matched pairing — Selenium
     * warns about a mismatch but still uses it. Passing both paths explicitly
     * via `Options.setChromeBinaryPath`/`Builder.setChromeService` bypasses
     * PATH (and Selenium Manager's own auto-detection of an unrelated
     * system-installed Chrome) entirely.
     */
    constructor(options?: AdapterOptions & {
        browser?: string;
        args?: readonly string[];
        chromeBinaryPath?: string;
        chromedriverPath?: string;
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
    private requireDriver;
    /**
     * Give an action that may navigate a moment to commit. See the identical
     * note on `PlaywrightAdapter.settle` — every adapter must behave the same
     * or the cognition engine could tell them apart.
     */
    private settle;
}
//# sourceMappingURL=selenium.d.ts.map