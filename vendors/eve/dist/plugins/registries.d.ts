/**
 * The default registry set plugins receive in `EvePlugin.onRegister`.
 *
 * Aggregation lives here (not in `core`) because `core` depends on nothing,
 * while the verb registry is CP/1-adjacent and the dimension registry is
 * scoring-adjacent.
 */
import type { EveRegistries } from "../core/registry.js";
export declare const defaultRegistries: EveRegistries;
//# sourceMappingURL=registries.d.ts.map