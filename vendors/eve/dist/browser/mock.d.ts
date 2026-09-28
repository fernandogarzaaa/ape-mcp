import type { Point, Viewport, VisibleElement } from "../core/types.js";
import type { BrowserAdapter, RawSnapshot } from "./adapter.js";
/**
 * MockAdapter — an in-memory simulated application.
 *
 * Serves three purposes:
 *  1. Deterministic unit/integration tests of the whole engine without a
 *     real browser.
 *  2. Offline demos (`eve run mock:`) so users can watch a full simulation
 *     without installing Playwright.
 *  3. A reference for adapter authors: it implements the exact contract.
 *
 * A mock app is a graph of screens; clicking an element whose `goto` matches
 * a screen id navigates there. Elements are laid out automatically in rows.
 */
export interface MockElementSpec {
    role?: VisibleElement["role"];
    text: string;
    goto?: string;
    editable?: boolean;
    disabled?: boolean;
    /** Shown only after this element receives typed input. */
    onTypeReveal?: string;
    color?: string;
    backgroundColor?: string;
    fontSize?: number;
    width?: number;
    height?: number;
}
export interface MockScreenSpec {
    id: string;
    title: string;
    elements: MockElementSpec[];
    /** Extra screen-load latency in virtual ms. */
    latencyMs?: number;
}
export interface MockAppSpec {
    name: string;
    start: string;
    screens: MockScreenSpec[];
}
/** A small but realistic demo app: landing → login → dashboard → settings. */
export declare const DEMO_APP: MockAppSpec;
export declare class MockAdapter implements BrowserAdapter {
    readonly name = "mock";
    readonly version = "0.5.0";
    /** Visual/spatial like a real browser, but never produces a screenshot. */
    readonly capabilities: {
        readonly spatial: boolean;
        readonly modality: import("../index.js").Modality;
        readonly canGoBack: boolean;
        readonly canScroll: boolean;
        readonly pointer: "mouse" | "touch";
        readonly canHover: boolean;
        readonly actionVerbs?: readonly string[];
        readonly canScreenshot: false;
    };
    private readonly app;
    private currentId;
    private history;
    private viewport;
    private scrollY;
    private typedInto;
    private focusedIndex;
    private opened;
    constructor(app?: MockAppSpec);
    open(url: string, viewport: Viewport): Promise<void>;
    snapshot(): Promise<RawSnapshot>;
    screenshot(): Promise<Buffer | null>;
    moveMouse(): Promise<void>;
    clickAt(point: Point): Promise<void>;
    doubleClickAt(point: Point): Promise<void>;
    typeText(text: string): Promise<void>;
    pressKey(key: string): Promise<void>;
    scrollBy(deltaY: number): Promise<void>;
    goBack(): Promise<void>;
    navigate(url: string): Promise<void>;
    close(): Promise<void>;
    private go;
    private screen;
    /** Simple single-column layout; positions are viewport-relative. */
    private layout;
}
//# sourceMappingURL=mock.d.ts.map