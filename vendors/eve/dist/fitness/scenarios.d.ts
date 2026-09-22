/**
 * The scenario suite a mutation is measured against.
 *
 * EVE owns benchmark scenarios, and the three reference apps in
 * `benchmarks/apps.ts` are the instrument: they implement the same task at
 * three deliberately different quality levels, and `validateBenchmarks` asserts
 * EVE scores them in strict order. That internal discrimination is what makes
 * a fitness delta mean anything — an instrument that cannot separate a good
 * app from a bad one cannot detect that a mutation made an operator worse.
 *
 * A fitness measurement therefore reuses the validated instrument rather than
 * inventing scenarios for the purpose. Registering a scenario is possible (see
 * {@link registerScenario}) and is how a deployment measures mutations against
 * its own product, but the built-in three are the calibrated default.
 */
import type { MockAppSpec } from "../browser/index.js";
export interface Scenario {
    readonly id: string;
    /** The environment an operator is dropped into. */
    readonly app: MockAppSpec;
    /** What the operator is trying to achieve. */
    readonly goal: string;
    /** Perceiving this text means the goal was reached. */
    readonly successSignal: string;
}
/**
 * The scenario ids measured when a request names none.
 *
 * Derived from `BENCHMARK_APPS` rather than restated, so adding a reference app
 * extends the default suite instead of silently leaving it behind.
 */
export declare const DEFAULT_SCENARIO_IDS: readonly string[];
/**
 * Register a scenario, making it addressable by id in a `ValidationRequest`.
 *
 * Replacing a built-in id is permitted and is how a deployment substitutes its
 * own product for a reference app. It is also how construct validity gets lost,
 * so callers that do it should run `validateBenchmarks` against their own suite.
 */
export declare function registerScenario(scenario: Scenario): void;
export declare function listScenarios(): readonly Scenario[];
/**
 * Resolve scenario ids, failing on the first unknown one.
 *
 * Skipping unknown ids would silently measure a mutation against fewer
 * scenarios than were asked for, and report the result as though the full suite
 * had run.
 */
export declare function resolveScenarios(ids: readonly string[]): readonly Scenario[];
//# sourceMappingURL=scenarios.d.ts.map