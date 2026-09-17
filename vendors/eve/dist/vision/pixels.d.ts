import type { BoundingBox } from "../core/types.js";
/**
 * Low-level pixel utilities. Everything in the vision module operates on
 * decoded screenshots — the same signal a human retina receives — plus the
 * element geometry from the percept.
 */
export interface DecodedImage {
    readonly width: number;
    readonly height: number;
    /** RGBA, row-major. */
    readonly data: Uint8Array;
}
export declare function decodePng(buffer: Buffer): DecodedImage;
export declare function pixelAt(img: DecodedImage, x: number, y: number): [number, number, number];
/** WCAG relative luminance of an sRGB pixel. */
export declare function relativeLuminance(r: number, g: number, b: number): number;
/** WCAG contrast ratio between two luminances. */
export declare function contrastRatio(l1: number, l2: number): number;
export declare function parseHexColor(hex: string): [number, number, number] | null;
/**
 * Sample luminances within a box (subsampled grid). Returns sorted values.
 */
export declare function sampleLuminances(img: DecodedImage, box: BoundingBox, gridSize?: number): number[];
/**
 * Fraction of pixels that differ between two same-sized frames beyond a
 * per-channel threshold. The workhorse of visual-regression and
 * "did-anything-change" detection.
 */
export declare function frameDiffRatio(a: DecodedImage, b: DecodedImage, threshold?: number): number;
/** Variance of luminance across the whole frame — blank screens are ~0. */
export declare function luminanceVariance(img: DecodedImage): number;
//# sourceMappingURL=pixels.d.ts.map