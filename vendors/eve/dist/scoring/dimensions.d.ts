/**
 * The score-dimension registry.
 *
 * The sixteen dimensions that were the `ScoreDimension` closed union are
 * pre-registered as built-ins with their serialized ids unchanged, so scores,
 * reports and stored baselines are unaffected. Domain packs and plugins
 * register new dimensions here (see `EvePlugin.onRegister`) instead of
 * editing `src/core/types.ts`.
 *
 * `weight` publishes each built-in's share of the `overall` composite (the
 * scorer remains the single source of truth in Phase 0 — registering a
 * dimension can never silently reweight existing scores), and `appliesTo`
 * declares the modalities a dimension is meaningful on. No Phase-0 consumer
 * gates on `appliesTo`, so behavior is unchanged; it exists so the honesty
 * layer can treat inapplicable dimensions as *skipped, not failed* once
 * non-visual surfaces land scoring consumers.
 */
import { EveRegistry, type Modality, type ScoreDimensionEntry } from "../core/registry.js";
export declare const dimensionRegistry: EveRegistry<ScoreDimensionEntry>;
/**
 * Register a new score dimension (domain packs; plugins via `onRegister`).
 *
 * `weight` defaults to 0 — a new dimension is reported but never changes
 * the composite of an existing deployment unless it explicitly asks to.
 */
export declare function registerDimension(entry: Omit<ScoreDimensionEntry, "builtin" | "evidenceRequired" | "weight" | "appliesTo"> & Partial<Pick<ScoreDimensionEntry, "weight" | "appliesTo">>): void;
/** Dimensions meaningful on the given modality (`appliesTo` gating). */
export declare function dimensionsFor(modality: Modality): readonly ScoreDimensionEntry[];
//# sourceMappingURL=dimensions.d.ts.map