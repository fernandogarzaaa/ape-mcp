/**
 * Typed argument synthesis for tool surfaces (Phase 2).
 *
 * Phase 1 funneled JSON Schema types through a single text channel: the
 * persona typed characters and the adapter re-parsed them, so "the operator
 * typed badly" and "the operator probed an edge case" were indistinguishable
 * (projection debt ledger item 4). On the kernel, argument intent is a
 * cognition-side decision: given the schema the surface itself advertises
 * (perceived metadata on an `mcp.tool` affordance), produce plausible,
 * correctly-typed arguments a human operator would try.
 *
 * Everything here is derived from the advertised schema and field naming —
 * the same cues `plausibleInput` uses for web forms — never from server
 * internals.
 */
import type { Rng } from "../core/random.js";
type JsonSchema = Readonly<Record<string, unknown>>;
/**
 * Synthesize arguments for a tool call. Required properties are always
 * filled; optional ones are filled with a coin flip (a human fills what a
 * form seems to ask for, and sometimes more).
 */
export declare function synthesizeArguments(schema: JsonSchema | undefined, personaName: string, rng: Rng): Record<string, unknown>;
export {};
//# sourceMappingURL=toolArgs.d.ts.map