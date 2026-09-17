/**
 * MCP server evaluation (Phase 1 of the expansion roadmap).
 *
 * - `McpAdapter` (`src/surface/mcp.ts`) projects an MCP server onto the
 *   textual-surface seam so personas can operate it through the normal
 *   session loop (`eve run mcp:…`).
 * - The oracles here are the deterministic tier-1 evaluators: schema
 *   quality, protocol conformance, and seeded robustness fuzzing
 *   (`evaluateMcpServer` / `eve mcp-eval`).
 */
export { checkConformance } from "./conformanceOracle.js";
export { evaluateMcpServer, renderMcpEvalMarkdown, } from "./evaluate.js";
export { fuzzTools } from "./fuzzOracle.js";
export { checkToolSchemas } from "./schemaOracle.js";
export { DIMENSION_FOR_CATEGORY, MCP_DIMENSIONS, MCP_FINDING_CATEGORIES, } from "./types.js";
export { registerMcpVocabulary } from "./vocabulary.js";
//# sourceMappingURL=index.js.map