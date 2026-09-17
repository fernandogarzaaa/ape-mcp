import type { LoopIteration, Percept } from "../core/types.js";
import type { EvePlugin, PluginContext } from "./plugin.js";
/**
 * Accessibility plugin: perceptual accessibility review beyond what the
 * operator's own vision checks catch.
 *
 * All checks operate on the percept (visible reality), not on ARIA metadata
 * dumps — an unlabeled image is flagged because a screen-reader user would
 * perceive nothing, mirroring how the barrier manifests.
 */
export declare class AccessibilityPlugin implements EvePlugin {
    readonly name = "accessibility";
    private readonly reportedScreens;
    onPercept(ctx: PluginContext, percept: Percept): Promise<void>;
    /**
     * A hover-only affordance can't be detected from a single percept — there
     * is nothing in the DOM/CSS boundary a `Percept` is allowed to expose that
     * says "this only appears on hover" (that would be exactly the privileged
     * information adapters are forbidden from leaking). What *is* observable,
     * perceptually, is the operator's own behavior: cognition decided to hover
     * over something. On a surface with no persistent pointer, that decision
     * itself is the evidence — the affordance the operator's mental model
     * expected to reach is unreachable here.
     */
    onSessionEnd(ctx: PluginContext, iterations: readonly LoopIteration[]): Promise<void>;
}
//# sourceMappingURL=accessibility.d.ts.map