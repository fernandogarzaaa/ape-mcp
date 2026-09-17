/**
 * Aggregate multimodal cues across a session's perceived screens into a report,
 * surfacing perception risks (unlabeled icons/charts/media) and dynamic UI
 * (loading states, toasts).
 */
import type { Percept } from "../core/types.js";
import type { SessionResult } from "../engine/session.js";
import type { MultimodalPerceptor, MultimodalReport } from "./types.js";
/** Analyze the multimodal perception of a set of perceived screens. */
export declare function analyzeScreens(screens: readonly Percept[], perceptor?: MultimodalPerceptor): MultimodalReport;
/** Analyze the multimodal perception captured across a whole session. */
export declare function analyzeMultimodal(session: SessionResult, perceptor?: MultimodalPerceptor): MultimodalReport;
//# sourceMappingURL=analyze.d.ts.map