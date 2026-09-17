import { VISUAL_SURFACE } from "../surface/capabilities.js";
import { importDriver } from "./driverLoader.js";
import { perceiveAcrossNavigation } from "./navigationRetry.js";
import { PERCEPTION_SCRIPT } from "./perceptionScript.js";
export class PlaywrightAdapter {
    name = "playwright";
    capabilities = VISUAL_SURFACE;
    browser = null;
    page = null;
    pendingNativeDialogs = [];
    options;
    constructor(options = {}) {
        this.options = { headless: options.headless ?? true, settleMs: options.settleMs ?? 400 };
    }
    async open(url, viewport) {
        const playwright = await importPlaywright();
        this.browser = (await playwright.chromium.launch({
            headless: this.options.headless,
        }));
        this.page = await this.browser.newPage();
        await this.page.setViewportSize(viewport);
        this.page.on("dialog", (dialog) => {
            // Native alert/confirm: a human sees the text, then accepts. We record
            // the message so the next percept can surface it as a dialog.
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
    async moveMouse(point) {
        await this.requirePage().mouse.move(point.x, point.y, { steps: 8 });
    }
    async clickAt(point) {
        await this.requirePage().mouse.click(point.x, point.y);
        await this.settle();
    }
    async doubleClickAt(point) {
        await this.requirePage().mouse.dblclick(point.x, point.y);
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
        // A wheel event resolves once dispatched, not once the page has scrolled.
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
        this.page = null;
    }
    requirePage() {
        if (!this.page)
            throw new Error("PlaywrightAdapter: call open() first");
        return this.page;
    }
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
    async settle() {
        if (this.options.settleMs > 0)
            await this.requirePage().waitForTimeout(this.options.settleMs);
    }
}
async function importPlaywright() {
    return (await importDriver("playwright", "npm install playwright"));
}
//# sourceMappingURL=playwright.js.map