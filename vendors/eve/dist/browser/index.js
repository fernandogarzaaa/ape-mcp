export { diagnoseSurfaces, isOptionalTransport, renderDoctor } from "./doctor.js";
export { DriverLoadError, DriverMissingError } from "./driverLoader.js";
export { CLICK_MISCLICK_POLICY, hesitationMs, planClick, planSoftKeyType, planSwipe, planTap, planTyping, TAP_MISCLICK_POLICY, } from "./humanizer.js";
export { DEVICE_PRESETS, MobileAdapter } from "./mobile.js";
export { DEMO_APP, MockAdapter } from "./mock.js";
export { mergeNativeDialogs, recordNativeDialog, resolveNativeDialogHandling, } from "./nativeDialog.js";
export { PERCEPTION_SCRIPT } from "./perceptionScript.js";
export { PlaywrightAdapter } from "./playwright.js";
export { PuppeteerAdapter } from "./puppeteer.js";
export { SeleniumAdapter } from "./selenium.js";
import { MobileAdapter } from "./mobile.js";
import { MockAdapter } from "./mock.js";
import { PlaywrightAdapter } from "./playwright.js";
import { PuppeteerAdapter } from "./puppeteer.js";
import { SeleniumAdapter } from "./selenium.js";
/** Factory used by the CLI and config loader. */
export function createAdapter(name, options = {}) {
    switch (name) {
        case "playwright":
            return new PlaywrightAdapter(options);
        case "puppeteer":
            return new PuppeteerAdapter(options);
        case "selenium":
            return new SeleniumAdapter(options);
        case "mobile":
            return new MobileAdapter(options);
        case "mock":
            return new MockAdapter();
        default: {
            const exhaustive = name;
            throw new Error(`Unknown adapter "${String(exhaustive)}"`);
        }
    }
}
//# sourceMappingURL=index.js.map