/**
 * Types for the MCP evaluation harness (Phase-1 tier-1 oracles).
 *
 * These types deliberately mirror `Finding`/`Score` from `src/core/types.ts`
 * but with the category/dimension vocabularies the MCP pack registers via
 * the Phase-0 registries (`registerMcpVocabulary`). They are *not* folded
 * into the closed `FindingCategory`/`ScoreDimension` unions — widening
 * those types is Phase-2 core work. When MCP findings are later merged into
 * session reports, the registry entries guarantee the ids resolve and carry
 * `appliesTo`/`evidenceRequired` metadata.
 */
/** Finding categories this pack registers in `findingCategoryRegistry`. */
export const MCP_FINDING_CATEGORIES = [
    "mcp.schema-quality",
    "mcp.robustness",
    "mcp.conformance",
];
/** Score dimensions this pack registers in `dimensionRegistry`. */
export const MCP_DIMENSIONS = ["mcp.schemaQuality", "mcp.robustness", "mcp.conformance"];
/** Finding category ↔ score dimension correspondence. */
export const DIMENSION_FOR_CATEGORY = {
    "mcp.schema-quality": "mcp.schemaQuality",
    "mcp.robustness": "mcp.robustness",
    "mcp.conformance": "mcp.conformance",
};
//# sourceMappingURL=types.js.map