/**
 * The moderator — reconciles the independent specialist reports into one
 * executive study report: where the panel agrees (consensus), where it pulls
 * in different directions (conflicts), the merged priority list, and an overall
 * release verdict with a confidence that reflects both panel agreement and
 * sample size.
 */
import type { PopulationStudy } from "../population/population.js";
import type { ExecutiveStudyReport } from "./types.js";
/**
 * Convene the AI-moderated user study over a population study: every specialist
 * files an independent report, then the moderator synthesizes them.
 */
export declare function moderateStudy(study: PopulationStudy): ExecutiveStudyReport;
//# sourceMappingURL=moderator.d.ts.map