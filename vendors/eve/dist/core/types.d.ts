/**
 * Core domain types shared across every EVE module.
 *
 * The guiding constraint of the whole system: the simulated operator may only
 * ever act on information a human could perceive through a screen. Types in
 * this file model that boundary explicitly — a {@link Percept} contains only
 * human-visible information (pixels, visible text, layout geometry, the URL
 * bar, loading indicators), never DOM internals, network traffic, console
 * output or source code.
 *
 * **Phase 2 note (modality-variant kernel):** {@link Percept} and the eleven
 * browser-flavored {@link Action} kinds are the *deprecated web view* of the
 * modality-agnostic kernel in `src/core/kernel.ts` (`KernelPercept`,
 * `Affordance`, `SurfaceSignal`, `KernelAction`). They remain the session
 * contract and are fully supported — existing adapters and consumers keep
 * working unchanged — but new surface vocabulary (new verbs, new signal
 * types, new affordance kinds) is added to the kernel, not to these shapes.
 */
/** Axis-aligned rectangle in CSS pixels, viewport-relative. */
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** A point in CSS pixels, viewport-relative. */
export interface Point {
    x: number;
    y: number;
}
export interface Viewport {
    width: number;
    height: number;
}
/**
 * Coarse perceptual role of a visible element, as a human would classify it
 * at a glance ("that's a button", "that's a text field"). This is inferred
 * from rendered appearance/semantics, not from framework internals.
 */
export type PerceivedRole = "button" | "link" | "textbox" | "checkbox" | "radio" | "select" | "slider" | "tab" | "menuitem" | "image" | "heading" | "text" | "listitem" | "dialog" | "alert" | "progress" | "table" | "unknown";
/**
 * One element a human could see on screen right now.
 *
 * This is EVE's "retina abstraction": a stand-in for OCR + visual object
 * recognition. It is deliberately restricted to what is *actually rendered
 * and visible* — hidden elements, off-screen content, aria-only metadata and
 * DOM structure are excluded by the perception script.
 */
export interface VisibleElement {
    /** Ephemeral perceptual id, stable only within a single percept. */
    readonly id: number;
    readonly role: PerceivedRole;
    /** Visible text content, truncated to what a human reads at a glance. */
    readonly text: string;
    readonly box: BoundingBox;
    /** Whether the element visually affords interaction (cursor, tag, tabindex). */
    readonly interactive: boolean;
    /** Visually disabled (greyed out / disabled attribute). */
    readonly disabled: boolean;
    /** Accepts typed input. */
    readonly editable: boolean;
    /** Currently holds keyboard focus (visible via focus ring). */
    readonly focused: boolean;
    /** Whether the element is fully inside the viewport (vs partially clipped). */
    readonly clippedByViewport: boolean;
    /**
     * True when a modeled soft-keyboard band covers this element (see
     * {@link Percept.keyboardOcclusion}). A distinct fact from
     * `clippedByViewport`: that flag is horizontal CSS overflow computed by the
     * perception script from real layout; this one is a vertical, dynamic
     * overlay modeled by the observation layer for touch surfaces, not
     * perceived from the page. Absent (not merely false) on adapters that never
     * compute it.
     */
    readonly occludedByKeyboard?: boolean;
    /** Perceived foreground/background colors when resolvable, as #rrggbb. */
    readonly color?: string;
    readonly backgroundColor?: string;
    /** Font size in CSS pixels when resolvable. */
    readonly fontSize?: number;
}
/** A modal dialog / alert visibly blocking or overlaying the page. */
export interface VisibleDialog {
    readonly text: string;
    readonly box: BoundingBox | null;
}
/**
 * Everything the operator perceives in one glance at the screen.
 */
export interface Percept {
    /** Milliseconds since session start. */
    readonly timestamp: number;
    /** The URL bar is visible to humans. */
    readonly url: string;
    /** The tab title is visible to humans. */
    readonly title: string;
    readonly viewport: Viewport;
    readonly scrollY: number;
    readonly scrollHeight: number;
    /** PNG-encoded screenshot, when the adapter can produce one. */
    readonly screenshot: Buffer | null;
    readonly elements: readonly VisibleElement[];
    readonly dialogs: readonly VisibleDialog[];
    /** A visible loading indicator (spinner, skeleton, progress bar) is present. */
    readonly loadingIndicator: boolean;
    /**
     * Viewport-relative rect a modeled soft keyboard covers, or null when none
     * is up. Only ever set on touch surfaces with a focused editable element;
     * modeled from the device's `softKeyboardHeightPx`, not perceived — no
     * headless browser renders a real IME. Optional (not just nullable) so
     * every existing `Percept` literal in tests and non-touch adapters is
     * unaffected.
     */
    readonly keyboardOcclusion?: BoundingBox | null;
}
export type Action = {
    kind: "click";
    target: VisibleElement;
    point?: Point;
} | {
    kind: "doubleClick";
    target: VisibleElement;
} | {
    kind: "hover";
    target: VisibleElement;
} | {
    kind: "type";
    target: VisibleElement;
    text: string;
} | {
    kind: "press";
    key: string;
} | {
    kind: "scroll";
    deltaY: number;
} | {
    kind: "navigate";
    url: string;
} | {
    kind: "back";
} | {
    kind: "read";
    target: VisibleElement | null;
    durationMs: number;
} | {
    kind: "wait";
    durationMs: number;
} | {
    kind: "abandon";
    reason: string;
} | {
    /**
     * Phase 2: a kernel-native action — one semantic act on a surface that
     * declares its own verb registry via `SurfaceCapabilities.actionVerbs`
     * (e.g. a single `mcp.invoke` carrying typed tool arguments). Executed
     * through the adapter's kernel actuator (`KernelSurface.actKernel`), not
     * decomposed into synthetic UI gestures. See `src/core/kernel.ts`.
     */
    kind: "invoke";
    /** Registry-backed verb, e.g. "mcp.invoke". */
    verb: string;
    target: VisibleElement | null;
    /** Typed, surface-defined payload (structured arguments — no coercion). */
    payload?: unknown;
};
export declare function describeAction(action: Action): string;
/**
 * Before acting, the operator predicts what will happen. After acting, the
 * prediction is compared against reality and the gap drives emotion,
 * learning and findings ("expectation violations").
 */
export interface Prediction {
    /** Natural-language statement of the expected outcome. */
    readonly description: string;
    /**
     * Words/phrases the operator expects to perceive on the next screen if the
     * prediction holds (matched against visible text, title and URL).
     */
    readonly expectedSignals: readonly string[];
    /** Whether the operator expects the screen to change at all. */
    readonly expectsChange: boolean;
    /** 0..1 subjective confidence in the prediction. */
    readonly confidence: number;
}
export interface PredictionOutcome {
    readonly prediction: Prediction;
    /** 0 = exactly as expected, 1 = nothing like expected. */
    readonly surprise: number;
    readonly matchedSignals: readonly string[];
    readonly missedSignals: readonly string[];
    /** Did the screen change at all? */
    readonly screenChanged: boolean;
    /** A visible error message appeared. */
    readonly errorPerceived: boolean;
    /** Perceived wait between action and settled screen, in ms. */
    readonly perceivedLatencyMs: number;
}
export type FindingSeverity = "critical" | "major" | "minor" | "info";
/**
 * The built-in finding categories, pre-registered in
 * `findingCategoryRegistry` (`src/core/findingCategories.ts`). The registry
 * is the source of truth at runtime; this tuple pins the serialized values
 * the type-level union is derived from, so existing `FindingCategory` types
 * and stored reports are unaffected.
 */
export declare const FINDING_CATEGORIES: readonly ["usability", "navigation", "visual", "accessibility", "performance", "content", "error-recovery", "expectation-violation", "workflow", "consistency"];
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
/**
 * A finding's category: one of the built-ins above, or any id registered in
 * `findingCategoryRegistry` (Phase 0/2 — the registry is the runtime source
 * of truth, so the type-level vocabulary is open). The `(string & {})`
 * trick keeps built-in autocomplete while admitting registered ids like
 * `mcp.robustness`.
 */
export type FindingCategoryId = FindingCategory | (string & {});
export interface Finding {
    readonly id: string;
    readonly severity: FindingSeverity;
    readonly category: FindingCategoryId;
    readonly title: string;
    readonly description: string;
    /** What the operator was doing / seeing when this was found. */
    readonly evidence: readonly string[];
    readonly url: string;
    readonly timestamp: number;
    /** Screenshot index in the session gallery, when captured. */
    readonly screenshotIndex?: number;
    readonly recommendation?: string;
}
/**
 * The built-in score dimensions, pre-registered in `dimensionRegistry`
 * (`src/scoring/dimensions.ts`). The registry is the runtime source of
 * truth; this tuple pins the serialized values the type-level union is
 * derived from, so existing `ScoreDimension` types and stored reports are
 * unaffected.
 */
export declare const SCORE_DIMENSIONS: readonly ["overall", "usability", "learnability", "accessibility", "efficiency", "consistency", "visualDesign", "navigation", "workflowQuality", "informationArchitecture", "onboarding", "errorRecovery", "responsiveness", "userConfidence", "cognitiveLoad", "trust"];
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
/**
 * A score's dimension: one of the built-ins above, or any id registered in
 * `dimensionRegistry` (the registry is the runtime source of truth, so the
 * type-level vocabulary is open — e.g. the MCP pack's `mcp.*` dimensions).
 */
export type ScoreDimensionId = ScoreDimension | (string & {});
export interface Score {
    readonly dimension: ScoreDimensionId;
    /** 0..100 */
    readonly value: number;
    readonly evidence: readonly string[];
}
/** One full pass through the human loop. */
export interface LoopIteration {
    readonly step: number;
    readonly timestamp: number;
    readonly url: string;
    readonly goal: string;
    readonly subgoal: string | null;
    readonly action: Action;
    readonly actionDescription: string;
    readonly rationale: string;
    readonly prediction: Prediction;
    readonly outcome: PredictionOutcome | null;
    /** Snapshot of emotional state *after* the outcome was appraised. */
    readonly emotion: Readonly<Record<string, number>>;
    readonly screenshotIndex: number | null;
    readonly clickPoint: Point | null;
}
export interface SessionUsage {
    readonly steps: number;
    readonly durationMs: number;
    readonly screensVisited: number;
    readonly uniqueUrls: number;
}
//# sourceMappingURL=types.d.ts.map