/**
 * Second stage: grouping ink into regions and saying what each
 * one looks like.
 *
 * It runs in two passes, because the unit a person perceives is not the unit
 * a flood fill finds.
 *
 * The fill bridges a small horizontal gap, so a row of words becomes one line
 * rather than five disconnected blobs. It deliberately does not bridge
 * vertically — the space between lines is genuinely blank — which leaves every
 * line its own blob. That is the wrong unit twice over: line rhythm is a
 * property of a block of type and cannot be seen from a single line, and a
 * reader looking at a chart sees one chart, not four captions.
 *
 * So a second pass assembles lines into blocks, joining those that sit close
 * and share a margin. Only then is it meaningful to ask whether a region has
 * the rhythm of set type.
 */
import { type InkGrid } from "./ink.js";
import type { PixelRegion } from "./types.js";
/**
 * Discover what is rendered, in CSS-pixel coordinates.
 *
 * `scale` converts device pixels to CSS pixels. It is not assumed to be 1:
 * mobile emulation renders at 2x or 3x, and a check that reported device
 * pixels there would place every region at a fraction of its true position
 * and never match a DOM box again.
 */
export declare function findRegions(grid: InkGrid, scale: number, pageLuminance: number): PixelRegion[];
//# sourceMappingURL=regions.d.ts.map