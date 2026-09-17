/**
 * Human validation engine — compare EVE's simulated population against
 * anonymized human usability traces and score the realism of the simulation.
 *
 * The objective is continuous improvement: a low similarity score points to a
 * behaviour where EVE and real humans diverge, which is exactly where the model
 * should be tuned next.
 */
import type { PopulationStudy } from "../population/population.js";
import type { CalibrationReport, HumanStudy } from "./types.js";
/**
 * Calibrate EVE against a human study, producing similarity scores and
 * correlations. Both sides are summarized to comparable aggregates first.
 */
export declare function calibrate(human: HumanStudy, eve: PopulationStudy): CalibrationReport;
/** Validate and normalize a parsed JSON object into a {@link HumanStudy}. */
export declare function importHumanStudy(raw: unknown): HumanStudy;
//# sourceMappingURL=calibration.d.ts.map