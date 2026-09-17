/**
 * The rendering check's vocabulary registration.
 *
 * A disagreement between the DOM and the rendering is not any of the existing
 * categories. "Accessibility" is close for two of the three, but it names a
 * different thing: an accessibility finding says a person with a particular
 * need is excluded, whereas `unaccounted-content` says nothing that reads the
 * page — assistive technology, EVE itself, any DOM-based tool — can reach
 * content everyone else can see. And `phantom-control` is not an
 * accessibility problem at all: it is a control that exists for automation
 * and for nobody else.
 *
 * So it registers its own category through the Phase-0 registries,
 * as the MCP, humanity and conversation packs do, rather than filing these
 * under a heading that would misdescribe them.
 *
 * `appliesTo: ["visual"]` throughout. There is no rendering to compare a DOM
 * against on a textual, document or conversational surface, so these can
 * never fire there and must not appear as dimensions those surfaces failed.
 */
/** The dimension these findings deduct from. */
export declare const RENDERING_DIMENSION = "rendering.fidelity";
export declare const RENDERING_CATEGORY = "rendering.fidelity";
/** Register the rendering check's dimension and finding category. Idempotent. */
export declare function registerRenderingVocabulary(): void;
//# sourceMappingURL=vocabulary.d.ts.map