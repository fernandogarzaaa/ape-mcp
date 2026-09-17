export type { AdapterOptions, BrowserAdapter, DeviceMetrics, RawSnapshot } from "./adapter.js";
export type { SurfaceReport, SurfaceStatus } from "./doctor.js";
export { diagnoseSurfaces, isOptionalTransport, renderDoctor } from "./doctor.js";
export { DriverLoadError, DriverMissingError } from "./driverLoader.js";
export type { Gesture, SwipePlan, SwipeSegment, TypingPlan } from "./humanizer.js";
export { hesitationMs, planClick, planSoftKeyType, planSwipe, planTap, planTyping, } from "./humanizer.js";
export { DEVICE_PRESETS, type DeviceName, MobileAdapter } from "./mobile.js";
export type { MockAppSpec, MockElementSpec, MockScreenSpec } from "./mock.js";
export { DEMO_APP, MockAdapter } from "./mock.js";
export { PERCEPTION_SCRIPT } from "./perceptionScript.js";
export { PlaywrightAdapter } from "./playwright.js";
export { PuppeteerAdapter } from "./puppeteer.js";
export { SeleniumAdapter } from "./selenium.js";
import type { AdapterOptions, BrowserAdapter } from "./adapter.js";
export type AdapterName = "playwright" | "puppeteer" | "selenium" | "mobile" | "mock";
/** Factory used by the CLI and config loader. */
export declare function createAdapter(name: AdapterName, options?: AdapterOptions): BrowserAdapter;
//# sourceMappingURL=index.d.ts.map