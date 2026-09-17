/**
 * First stage: turning pixels into "is there anything here".
 *
 * Everything downstream rests on one measurement — the *variance* of
 * luminance inside a small cell, rather than its brightness. Brightness says
 * what colour something is; variance says whether anything is drawn there.
 * A blank area of any colour has near-zero variance, the middle of a filled
 * button has near-zero variance, and glyph strokes against their background
 * have a lot of it. That single distinction is what lets EVE find rendered
 * content without knowing what the content is.
 *
 * The grid is coarse on purpose. Text at ordinary sizes still lands ink in
 * three or four cell rows, which is all the line-structure test needs, and a
 * 4px cell turns a million-pixel screenshot into ~60k cells — cheap enough to
 * run on every percept.
 */
import type { DecodedImage } from "../vision/pixels.js";
/**
 * Edge of a cell, in **CSS** pixels.
 *
 * Every threshold downstream is counted in cells — how far a fill reaches to
 * bridge a word gap, how close two lines must be to form a block, how thin a
 * band has to be to read as one line of type. Those are facts about human
 * perception, so the cell has to be a fixed perceptual size. Defining it in
 * device pixels instead makes all of them shrink by half on a 2x display,
 * where words stop bridging into lines and a paragraph shatters into pieces.
 */
export declare const CELL = 4;
/**
 * Cell edge in device pixels for a given device-pixel ratio.
 *
 * Rounded, and never below 1: a fractional ratio still has to land on whole
 * pixels, and a zero-width cell would divide by zero downstream.
 */
export declare function cellFor(scale: number): number;
/**
 * Within-cell luminance variance above which a cell counts as carrying
 * rendered detail.
 *
 * Calibrated against antialiasing rather than against text: a flat fill still
 * varies slightly where the encoder rounded, and a cell clipping the edge of
 * a solid shape varies a great deal. This sits above the first and below the
 * second, so "ink" means detail *inside* the cell, not a boundary crossing it.
 */
export declare const INK_VARIANCE = 0.0025;
export interface InkGrid {
    /** Cell counts, not pixels. */
    readonly width: number;
    readonly height: number;
    /** Device pixels per cell. */
    readonly cell: number;
    /** Mean luminance per cell, 0..1. */
    readonly luminance: Float32Array;
    /** Luminance variance per cell. */
    readonly variance: Float32Array;
    /** 1 where the cell carries rendered detail. */
    readonly ink: Uint8Array;
}
/** Index a cell, row-major. */
export declare function cellIndex(grid: InkGrid, cx: number, cy: number): number;
/**
 * Reduce an image to a grid of luminance means and variances.
 *
 * Partial cells at the right and bottom edges are measured over the pixels
 * they actually contain, so a viewport whose size is not a multiple of the
 * cell does not grow a false band of low-variance cells along two edges.
 */
export declare function inkGrid(img: DecodedImage, cell?: number): InkGrid;
/**
 * The page's background luminance, as the most common luminance among cells
 * carrying no detail.
 *
 * A mean would be dragged toward whatever dominates the screen — a dark hero
 * image makes a white page look grey. The mode of the *blank* cells is the
 * colour the reader would call "the background", which is the thing every
 * later comparison is against. Quantised into 32 buckets so antialiasing
 * spread does not split one background across neighbouring bins.
 */
export declare function backgroundLuminance(grid: InkGrid): number;
/**
 * Share of cells carrying detail inside a device-pixel box, 0..1.
 *
 * This is the measurement behind "the DOM says there is a button here and
 * nothing is drawn there". Boxes falling entirely outside the grid return 0,
 * which reads correctly: nothing was rendered where the DOM said to look.
 */
export declare function inkDensity(grid: InkGrid, box: {
    x: number;
    y: number;
    width: number;
    height: number;
}): number;
/** Mean luminance inside a device-pixel box, or the background when empty. */
export declare function meanLuminance(grid: InkGrid, box: {
    x: number;
    y: number;
    width: number;
    height: number;
}, fallback: number): number;
//# sourceMappingURL=ink.d.ts.map