/**
 * Rendering for an application map — a Markdown report and a Mermaid diagram
 * of the navigation graph.
 */
import type { ApplicationMap } from "./appmap.js";
/** Render the navigation graph as a Mermaid flowchart. */
export declare function renderApplicationMapMermaid(map: ApplicationMap): string;
/** Render the application map as a Markdown report (with a Mermaid diagram). */
export declare function renderApplicationMapMarkdown(map: ApplicationMap): string;
//# sourceMappingURL=report.d.ts.map