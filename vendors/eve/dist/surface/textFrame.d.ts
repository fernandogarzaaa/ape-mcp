import type { PerceivedRole, Viewport, VisibleElement } from "../core/types.js";
/**
 * Text-frame layout.
 *
 * A terminal is not a fake screen: text genuinely occupies rows and columns,
 * so character-cell geometry is an honest BoundingBox. What a textual surface
 * lacks is pixel-visual styling — font size, color, contrast — so those
 * optional properties are omitted rather than invented.
 */
/** Nominal width of one character cell, in CSS pixels. */
export declare const CELL_WIDTH = 8;
/** Nominal height of one text row, in CSS pixels. */
export declare const LINE_HEIGHT = 18;
/** Something the operator can act on next. */
export interface TextAffordance {
    readonly line: number;
    readonly column: number;
    readonly text: string;
    readonly role: PerceivedRole;
    /** The command to run when this affordance is actuated. */
    readonly command?: string;
}
export interface TextFrame {
    readonly lines: readonly string[];
    readonly affordances: readonly TextAffordance[];
    /** How many rows the operator can see at once. */
    readonly windowRows: number;
    /** Index of the topmost visible line. */
    readonly scrollLine: number;
}
export interface LaidOutFrame {
    readonly elements: VisibleElement[];
    readonly viewport: Viewport;
    readonly scrollY: number;
    readonly scrollHeight: number;
}
export declare function layoutTextFrame(frame: TextFrame): LaidOutFrame;
//# sourceMappingURL=textFrame.d.ts.map