import { TOUCH_VISUAL_SURFACE } from "../surface/capabilities.js";
import { perceiveAcrossNavigation } from "./navigationRetry.js";
import { PERCEPTION_SCRIPT } from "./perceptionScript.js";
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
export const DEVICE_PRESETS = {
    "iPhone 14": { softKeyboardHeightPx: 336 },
    "iPhone SE": { softKeyboardHeightPx: 258 },
    "Pixel 7": { softKeyboardHeightPx: 288 },
    "iPad Mini": { softKeyboardHeightPx: 380 },
};
const DEFAULT_DEVICE = "iPhone 14";
export class MobileAdapter {
    name = "mobile";
    capabilities = TOUCH_VISUAL_SURFACE;
    deviceMetrics;
    deviceName;
    browser = null;
    context = null;
    page = null;
    pendingNativeDialogs = [];
    options;
    constructor(options = {}) {
        this.options = { headless: options.headless ?? true, settleMs: options.settleMs ?? 400 };
        if (options.device !== undefined && !isDeviceName(options.device)) {
            throw new Error(`MobileAdapter: unknown device "${options.device}". Supported devices: ` +
                `${Object.keys(DEVICE_PRESETS).join(", ")}.`);
        }
        this.deviceName = options.device ?? DEFAULT_DEVICE;
        this.deviceMetrics = {
            softKeyboardHeightPx: DEVICE_PRESETS[this.deviceName].softKeyboardHeightPx,
        };
    }
    /**
     * `viewport` is intentionally ignored: emulating "iPhone 14" means using
     * its real viewport, not whatever generic desktop size the caller passed.
     * A mobile adapter that let the caller override the device's own geometry
     * would defeat the point of device emulation.
     */
    async open(url, _viewport) {
        const { chromium, devices } = await importPlaywright();
        const descriptor = devices[this.deviceName];
        if (!descriptor) {
            throw new Error(`MobileAdapter: Playwright has no device descriptor for "${this.deviceName}". ` +
                `Your installed Playwright version may not know this device yet.`);
        }
        this.browser = (await chromium.launch({
            headless: this.options.headless,
        }));
        this.context = await this.browser.newContext(descriptor);
        this.page = await this.context.newPage();
        this.page.on("dialog", (dialog) => {
            this.pendingNativeDialogs.push(dialog.message());
            void dialog.accept().catch(() => { });
        });
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await this.page.waitForTimeout(this.options.settleMs);
    }
    async snapshot() {
        const page = this.requirePage();
        const snap = await perceiveAcrossNavigation(() => page.evaluate(PERCEPTION_SCRIPT), (ms) => page.waitForTimeout(ms));
        if (this.pendingNativeDialogs.length > 0) {
            snap.dialogs = [
                ...snap.dialogs,
                ...this.pendingNativeDialogs.map((text) => ({ text, box: null })),
            ];
            this.pendingNativeDialogs = [];
        }
        return snap;
    }
    async screenshot() {
        try {
            return await this.requirePage().screenshot({ type: "png" });
        }
        catch {
            return null;
        }
    }
    /** No persistent pointer on a touch surface; kept as a contract no-op. */
    async moveMouse() { }
    async clickAt(point) {
        await this.requirePage().touchscreen.tap(point.x, point.y);
        await this.settle();
    }
    /** A double-tap is two taps in quick succession, not a distinct gesture. */
    async doubleClickAt(point) {
        const page = this.requirePage();
        await page.touchscreen.tap(point.x, point.y);
        await page.touchscreen.tap(point.x, point.y);
        await this.settle();
    }
    async typeText(text, perCharIntervalMs) {
        await this.requirePage().keyboard.type(text, { delay: perCharIntervalMs });
    }
    async pressKey(key) {
        await this.requirePage().keyboard.press(key);
        await this.settle();
    }
    async scrollBy(deltaY) {
        await this.requirePage().mouse.wheel(0, deltaY);
        await this.settle();
    }
    async goBack() {
        await this.requirePage()
            .goBack({ timeout: 15_000 })
            .catch(() => { });
        await this.settle();
    }
    async navigate(url) {
        await this.requirePage().goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await this.settle();
    }
    async close() {
        await this.browser?.close().catch(() => { });
        this.browser = null;
        this.context = null;
        this.page = null;
    }
    requirePage() {
        if (!this.page)
            throw new Error("MobileAdapter: call open() first");
        return this.page;
    }
    async settle() {
        if (this.options.settleMs > 0)
            await this.requirePage().waitForTimeout(this.options.settleMs);
    }
}
function isDeviceName(value) {
    return value !== undefined && Object.hasOwn(DEVICE_PRESETS, value);
}
async function importPlaywright() {
    try {
        const spec = "playwright";
        return (await import(spec));
    }
    catch {
        throw new Error('MobileAdapter requires the optional peer dependency "playwright". Install it with: npm install playwright');
    }
}
//# sourceMappingURL=mobile.js.map