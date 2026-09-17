import type { Point, Viewport } from "../core/types.js";
import type { AdapterOptions, BrowserAdapter, DeviceMetrics, RawSnapshot } from "./adapter.js";
/**
 * Mobile web adapter: real device emulation plus touch actuation.
 *
 * Built on Playwright's device descriptors (viewport, device scale factor,
 * user agent, `hasTouch`, `isMobile`) rather than a hand-rolled viewport
 * resize, because those flags are what actually flips the browser's touch
 * behavior — `pointer: coarse` / `hover: none` media queries, touch event
 * dispatch, and tap-vs-click semantics all key off `hasTouch`/`isMobile` at
 * the context level, not off window dimensions. A resized desktop viewport
 * would still report itself as a mouse-and-hover surface to the page.
 *
 * Always launches Chromium, even for iOS device descriptors that recommend
 * WebKit — this keeps the adapter's runtime footprint identical to the
 * desktop Playwright adapter. Rendering-engine-specific quirks are out of
 * scope for this pass.
 *
 * Actuation is still dumb: `clickAt` performs one tap, `scrollBy` performs
 * one scroll delta. The realism — fat-finger scatter, thumb-reach cost,
 * swipe momentum, soft-keyboard cadence — is composed by the humanizer and
 * the engine, one primitive call at a time. This adapter never decides *how
 * many* taps or scrolls to issue.
 */
/**
 * Approximate on-screen keyboard heights, in CSS px, portrait orientation
 * with the predictive-text bar showing. These are modeled constants (typical
 * vendor keyboard heights), not measurements — no headless browser renders a
 * real IME, so there is nothing to measure at runtime. See
 * {@link DeviceMetrics.softKeyboardHeightPx}.
 */
export declare const DEVICE_PRESETS: {
    readonly "iPhone 14": {
        readonly softKeyboardHeightPx: 336;
    };
    readonly "iPhone SE": {
        readonly softKeyboardHeightPx: 258;
    };
    readonly "Pixel 7": {
        readonly softKeyboardHeightPx: 288;
    };
    readonly "iPad Mini": {
        readonly softKeyboardHeightPx: 380;
    };
};
export type DeviceName = keyof typeof DEVICE_PRESETS;
export declare class MobileAdapter implements BrowserAdapter {
    readonly name = "mobile";
    readonly capabilities: import("../surface/capabilities.js").SurfaceCapabilities;
    readonly deviceMetrics: DeviceMetrics;
    private readonly deviceName;
    private browser;
    private context;
    private page;
    private pendingNativeDialogs;
    private readonly options;
    constructor(options?: AdapterOptions);
    /**
     * `viewport` is intentionally ignored: emulating "iPhone 14" means using
     * its real viewport, not whatever generic desktop size the caller passed.
     * A mobile adapter that let the caller override the device's own geometry
     * would defeat the point of device emulation.
     */
    open(url: string, _viewport: Viewport): Promise<void>;
    snapshot(): Promise<RawSnapshot>;
    screenshot(): Promise<Buffer | null>;
    /** No persistent pointer on a touch surface; kept as a contract no-op. */
    moveMouse(): Promise<void>;
    clickAt(point: Point): Promise<void>;
    /** A double-tap is two taps in quick succession, not a distinct gesture. */
    doubleClickAt(point: Point): Promise<void>;
    typeText(text: string, perCharIntervalMs: number): Promise<void>;
    pressKey(key: string): Promise<void>;
    scrollBy(deltaY: number): Promise<void>;
    goBack(): Promise<void>;
    navigate(url: string): Promise<void>;
    close(): Promise<void>;
    private requirePage;
    private settle;
}
//# sourceMappingURL=mobile.d.ts.map