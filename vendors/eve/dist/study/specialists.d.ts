/**
 * The specialist panel — six independent "researcher" agents that each read a
 * population study through one professional lens and file their own report.
 * Every observation is grounded in a concrete statistic from the study, so the
 * panel is interpretable and deterministic (no hidden model calls).
 */
import type { PopulationStudy } from "../population/population.js";
import type { SpecialistReport } from "./types.js";
/** UX Researcher — task success, drop-off, and the shape of the population. */
export declare function uxResearcher(study: PopulationStudy): SpecialistReport;
/** Accessibility Specialist — a11y/visual findings and at-risk personas. */
export declare function accessibilitySpecialist(study: PopulationStudy): SpecialistReport;
/** QA Engineer — reproducible broken affordances and error-recovery gaps. */
export declare function qaEngineer(study: PopulationStudy): SpecialistReport;
/** Interaction Designer — navigation efficiency and dead-ends. */
export declare function interactionDesigner(study: PopulationStudy): SpecialistReport;
/** Behavioral Psychologist — the emotional arc of the population. */
export declare function behavioralPsychologist(study: PopulationStudy): SpecialistReport;
/** Product Manager — where a fix buys the most completion. */
export declare function productManager(study: PopulationStudy): SpecialistReport;
/** The full specialist panel, in report order. */
export declare const SPECIALISTS: readonly ((study: PopulationStudy) => SpecialistReport)[];
/** Run every specialist against the study. */
export declare function runSpecialists(study: PopulationStudy): SpecialistReport[];
//# sourceMappingURL=specialists.d.ts.map