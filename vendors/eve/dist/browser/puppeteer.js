import { VISUAL_SURFACE } from "../surface/capabilities.js";
import { importDriver } from "./driverLoader.js";
import { perceiveAcrossNavigation } from "./navigationRetry.js";
import { PERCEPTION_SCRIPT } from "./perceptionScript.js";
export class PuppeteerAdapter {
    name = "puppeteer";
    capabilities = VISUAL_SURFACE;
    browser = null;
    page = null;
    pendingNativeDialogs = [];
    options;
    launchArgs;
    /**
     * `args` is a launch-flags escape hatch, not a general option — a real
     * user's machine has a working Chrome sandbox and should never need it. It
     * exists for environments like a root-run container or a hardened CI
     * runner image, where the sandbox helper isn't usable and Chrome refuses
     * to start at all without `--no-sandbox`.
     */
    constructor(options = {}) {
        this.options = { headless: options.headless ?? true, settleMs: options.settleMs ?? 400 };
        this.launchArgs = options.args ?? [];
    }
    async open(url, viewport) {
        const puppeteer = await importPuppeteer();
        this.browser = (await puppeteer.launch({
            headless: this.options.headless,
            args: [...this.launchArgs],
        }));
        this.page = await this.browser.newPage();
        await this.page.setViewport(viewport);
        this.page.on("dialog", (dialog) => {
            this.pendingNativeDialogs.push(dialog.message());
            void dialog.accept().catch(() => { });
        });
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await sleep(this.options.settleMs);
    }
    async snapshot() {
        const page = this.requirePage();
        const snap = await perceiveAcrossNavigation(() => page.evaluate(PERCEPTION_SCRIPT), sleep);
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
            const data = await this.requirePage().screenshot({ type: "png", encoding: "binary" });
            return Buffer.isBuffer(data) ? data : Buffer.from(data);
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
        await this.requirePage().mouse.click(point.x, point.y, { clickCount: 2 });
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
        await this.requirePage().mouse.wheel({ deltaY });
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
            throw new Error("PuppeteerAdapter: call open() first");
        return this.page;
    }
    /**
     * Give an action that may navigate a moment to commit. See the identical
     * note on `PlaywrightAdapter.settle` — the two adapters must behave the
     * same or the cognition engine could tell them apart.
     */
    async settle() {
        if (this.options.settleMs > 0)
            await sleep(this.options.settleMs);
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function importPuppeteer() {
    const mod = (await importDriver("puppeteer", "npm install puppeteer"));
    return (mod.default ?? mod);
}
//# sourceMappingURL=puppeteer.js.map