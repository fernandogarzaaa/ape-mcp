/**
 * The MCP pack's vocabulary registration (Phase-0 registries in action).
 *
 * Registers the `mcp.*` score dimensions, finding categories and the
 * engine-side `mcp.invoke` action verb. All entries are textual-only
 * (`appliesTo: ["textual"]`) — they are meaningless on a pixel surface —
 * and, per the registry contract, `evidenceRequired: true` and
 * `onCp1Wire: false` are forced by the register functions themselves.
 *
 * Registration is idempotent: the module-level guard plus per-entry `has()`
 * checks make repeated imports and repeated calls safe (registries are
 * process-global singletons and reject duplicates loudly).
 */
/** Register the MCP pack's dimensions, finding categories and action verb. */
export declare function registerMcpVocabulary(): void;
//# sourceMappingURL=vocabulary.d.ts.map