import type { Percept, PredictionOutcome } from "../core/types.js";
import type { EvePlugin, PluginContext } from "./plugin.js";
/**
 * Performance plugin: reports on *perceived* performance — the waits a human
 * actually experiences — rather than synthetic metrics.
 */
export declare class PerformancePlugin implements EvePlugin {
    readonly name = "performance";
    private readonly latencies;
    private slowReported;
    onOutcome(ctx: PluginContext, outcome: PredictionOutcome, percept: Percept): Promise<void>;
    onSessionEnd(ctx: PluginContext): Promise<void>;
}
//# sourceMappingURL=performance.d.ts.map