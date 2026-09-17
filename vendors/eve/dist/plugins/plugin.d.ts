import type { EveRegistries } from "../core/registry.js";
import type { Finding, LoopIteration, Percept, PredictionOutcome } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
import type { SurfaceCapabilities } from "../surface/capabilities.js";
/**
 * Plugin system.
 *
 * Plugins are passive observers with one power: reporting findings. They see
 * the same percepts and outcomes the operator does (plus session metadata)
 * and contribute domain-specific judgment — accessibility review, performance
 * review, LLM critique, localization checks — without ever influencing the
 * operator's behavior. That separation keeps simulations comparable across
 * plugin configurations.
 *
 * A plugin may additionally widen EVE's vocabularies — score dimensions,
 * finding categories, engine-side action verbs — but only in `onRegister`,
 * the one hook that runs before any session starts. That keeps registration
 * deterministic and out of the loop.
 */
export interface PluginContext {
    readonly persona: Persona;
    readonly startUrl: string;
    /** Which perceptual dimensions the current surface actually has. */
    readonly capabilities: SurfaceCapabilities;
    /**
     * Whether the operator got what they came for, as the session sees it
     * *right now*. Meaningful in `onSessionEnd`, where it is settled; earlier
     * in the loop it reports progress so far, which is usually `false`.
     *
     * A plugin that judges the session as a whole needs this: "took nine turns
     * without resolving it" is a finding only when it was not resolved.
     */
    readonly goalAchieved: boolean;
    /** Report a finding into the session. Deduplicated by (title, url). */
    report(finding: Omit<Finding, "id" | "timestamp">): void;
    /**
     * Report that this plugin's own LLM call degraded to a non-LLM fallback
     * (missing/invalid API key, network error, refusal, malformed response).
     * Surfaced on `SessionResult.llmFallbackWarnings` and the `llm:fallback`
     * event so a degraded run is visible rather than silently indistinguishable
     * from a fully LLM-backed one.
     */
    reportLlmFallback(reason: string): void;
}
export interface EvePlugin {
    readonly name: string;
    /**
     * Called once when the plugin is registered, before any session starts.
     * The one place a plugin may widen a vocabulary: register custom score
     * dimensions, finding categories or engine-side action verbs. Registered
     * values serialize as strings, exactly like the built-ins, so reports and
     * CP/1 documents are unaffected.
     */
    onRegister?(registries: EveRegistries): void;
    /** Called once before the loop starts. */
    onSessionStart?(ctx: PluginContext): void | Promise<void>;
    /** Called for every settled percept. */
    onPercept?(ctx: PluginContext, percept: Percept, step: number): void | Promise<void>;
    /** Called after each action's outcome is known. */
    onOutcome?(ctx: PluginContext, outcome: PredictionOutcome, percept: Percept, step: number): void | Promise<void>;
    /** Called once when the loop finishes, with the full iteration record. */
    onSessionEnd?(ctx: PluginContext, iterations: readonly LoopIteration[]): void | Promise<void>;
}
export declare class PluginManager {
    private readonly onError;
    private readonly registries;
    private readonly plugins;
    constructor(onError?: (err: unknown, plugin: string) => void, registries?: EveRegistries);
    register(plugin: EvePlugin): void;
    list(): readonly EvePlugin[];
    sessionStart(ctx: PluginContext): Promise<void>;
    percept(ctx: PluginContext, percept: Percept, step: number): Promise<void>;
    outcome(ctx: PluginContext, outcome: PredictionOutcome, percept: Percept, step: number): Promise<void>;
    sessionEnd(ctx: PluginContext, iterations: readonly LoopIteration[]): Promise<void>;
    private each;
}
//# sourceMappingURL=plugin.d.ts.map