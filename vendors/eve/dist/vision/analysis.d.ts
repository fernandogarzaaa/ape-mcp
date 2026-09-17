import type { Percept } from "../core/types.js";
import type { AccessibilityProfile } from "../personas/persona.js";
/**
 * Visual analysis over percepts: layout geometry checks (from element boxes)
 * plus pixel-level checks (from screenshots when available). Each check
 * returns structured issues that the engine converts into findings.
 */
export type VisualIssueKind = "low-contrast" | "tiny-text" | "tiny-target" | "overlapping-elements" | "clipped-element" | "horizontal-overflow" | "misalignment" | "blank-screen" | "visual-regression" | "color-only-signal";
export interface VisualIssue {
    readonly kind: VisualIssueKind;
    readonly detail: string;
    readonly severityHint: "critical" | "major" | "minor";
    readonly elementText?: string;
}
export declare function checkGeometry(percept: Percept, accessibility: AccessibilityProfile): VisualIssue[];
/**
 * Approximate dichromatic color perception (Viénot/Brettel-style linear
 * projection, simplified to sRGB space). Good enough to flag red/green
 * signals that collapse for the simulated viewer.
 */
export declare function simulateColorVision([r, g, b]: [number, number, number], kind: AccessibilityProfile["colorVision"]): [number, number, number];
export declare function checkPixels(percept: Percept): VisualIssue[];
/**
 * Visual regression between two visits to the same screen: large unexpected
 * pixel churn while the perceived text stayed the same.
 */
export declare function checkRegression(previousShot: Buffer, currentShot: Buffer, sameTextContent: boolean): VisualIssue | null;
//# sourceMappingURL=analysis.d.ts.map