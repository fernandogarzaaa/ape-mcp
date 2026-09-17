/**
 * The finding-category registry.
 *
 * The ten categories that were the `FindingCategory` closed union are
 * pre-registered as built-ins with their serialized ids unchanged, so every
 * existing finding, report and consumer behaves exactly as before. Domain
 * packs and plugins register new categories here (see
 * `EvePlugin.onRegister`) instead of editing `src/core/types.ts`.
 *
 * `appliesTo` is metadata for the honesty layer: no Phase-0 consumer gates
 * on it, so behavior is unchanged; it exists so future reporting/scoring
 * can suppress inapplicable categories as *skipped, not failed*.
 */
import { EveRegistry, type FindingCategoryEntry } from "./registry.js";
export declare const findingCategoryRegistry: EveRegistry<FindingCategoryEntry>;
/** Register a new finding category (domain packs; plugins via `onRegister`). */
export declare function registerFindingCategory(entry: Omit<FindingCategoryEntry, "builtin" | "evidenceRequired" | "appliesTo"> & Partial<Pick<FindingCategoryEntry, "appliesTo">>): void;
//# sourceMappingURL=findingCategories.d.ts.map