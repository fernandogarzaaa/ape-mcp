/**
 * Counterfactual fitness measurement — the "Validate inside EVE" step of the
 * developmental lifecycle.
 *
 * ADAM sends a {@link ValidationRequest} naming a mutation, a scenario set and
 * a seed. EVE runs the scenario set twice: once with a baseline operator and
 * once with an operator carrying the mutation's projected trait deltas, using
 * the *same* seed both times. The only difference between the two runs is the
 * mutation, so the difference in outcome is attributable to it.
 *
 * This is what makes the measurement evidence rather than assertion. An
 * absolute score would be uninterpretable — "this mutation scored 72" says
 * nothing without knowing what the organism scored before — and a score
 * produced by the component proposing the change would not be measurement at
 * all.
 *
 * See `protocol/cp1/SPEC.md` section 7.1.
 */
import type { CpEvent, FitnessResult, ValidationRequest } from "../protocol/types.js";
/**
 * The operators a measurement runs. Three personas spanning the range that
 * matters: someone who has never seen the product, someone with no patience,
 * and someone fluent. A mutation that helps one and ruins another should not
 * read as neutral, which a single-persona measurement would make it.
 */
export declare const DEFAULT_PANEL: readonly string[];
export interface ValidateOptions {
    /** Personas to measure with. Defaults to {@link DEFAULT_PANEL}. */
    readonly panel?: readonly string[];
    /** Step ceiling per session. Sessions that hit it are treated as failures. */
    readonly maxSteps?: number;
    /** Thresholds governing the recommendation. */
    readonly thresholds?: Partial<Thresholds>;
    /**
     * Receives the `SimulationCompleted` event a real measurement emits, before
     * the `FitnessResult` that references it is returned.
     *
     * Nothing in the CP/1 wire contract requires the event to reach ADAM — the
     * endpoint answers a `ValidationRequest` with exactly one response line, and
     * changing that is a protocol version change (SPEC.md section 8). This is the
     * seam a caller uses to persist the event anywhere that matters: a log, an
     * event bus, a file. Without it, the `derived_from` edge on the result
     * commits to a run that nothing durable ever recorded.
     */
    readonly onEvent?: (event: CpEvent) => void;
}
export interface Thresholds {
    /** Composite gain, in basis points, at or above which a mutation is approved. */
    readonly approveDeltaBp: number;
    /** Composite loss at or below which a mutation is rejected. */
    readonly rejectDeltaBp: number;
    /**
     * Risk above which no delta is sufficient on its own. A high-risk mutation
     * that improves the composite still goes to a human, because the scenario
     * suite measures operational competence and not the consequences a risk score
     * is tracking.
     */
    readonly maxAutoApproveRiskBp: number;
    /**
     * Per-scenario regression, in basis points, that blocks approval regardless
     * of the aggregate. A mutation that lifts the mean while destroying one
     * scenario is not an improvement; averaging would hide exactly that.
     */
    readonly maxScenarioRegressionBp: number;
}
export declare const DEFAULT_THRESHOLDS: Thresholds;
/**
 * Measure a mutation and return a sealed CP/1 {@link FitnessResult}.
 *
 * @throws if the request names an unknown scenario, or names no scenario at all
 * after defaults are applied — both mean the caller asked for a measurement
 * that cannot be performed, and returning a result anyway would misrepresent
 * what was measured.
 */
export declare function validateMutation(request: ValidationRequest, options?: ValidateOptions): Promise<FitnessResult>;
//# sourceMappingURL=fitness.d.ts.map