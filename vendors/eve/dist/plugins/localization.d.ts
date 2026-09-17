import type { Percept } from "../core/types.js";
import type { EvePlugin, PluginContext } from "./plugin.js";
/**
 * Localization plugin.
 *
 * Uses the operator's cultural profile to flag convention mismatches a user
 * from that locale would perceive as friction: wrong currency symbol,
 * unexpected date format, decimal-separator mismatch, and (for RTL locales)
 * a left-to-right layout. Convention mismatch increases cognitive load and
 * lowers trust (Marcus & Gould 2000). Purely perceptual — reads only visible
 * text and the operator's own cultural expectations.
 */
export declare class LocalizationPlugin implements EvePlugin {
    readonly name = "localization";
    private culture;
    private readonly reportedScreens;
    private rtlReported;
    onSessionStart(ctx: PluginContext): Promise<void>;
    onPercept(ctx: PluginContext, percept: Percept): Promise<void>;
}
//# sourceMappingURL=localization.d.ts.map