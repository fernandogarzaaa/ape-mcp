/**
 * Aggregate multimodal cues across a session's perceived screens into a report,
 * surfacing perception risks (unlabeled icons/charts/media) and dynamic UI
 * (loading states, toasts).
 */
import { DEFAULT_MULTIMODAL_PERCEPTOR } from "./perceptor.js";
const ALL_KINDS = [
    "icon",
    "chart",
    "media",
    "loading",
    "toast",
    "text-in-image",
    "animation",
];
/** Analyze the multimodal perception of a set of perceived screens. */
export function analyzeScreens(screens, perceptor = DEFAULT_MULTIMODAL_PERCEPTOR) {
    const byKind = Object.fromEntries(ALL_KINDS.map((k) => [k, 0]));
    const unlabeled = [];
    const toasts = [];
    let screensWithLoading = 0;
    let total = 0;
    let previous;
    for (const percept of screens) {
        const { cues } = perceptor.perceive(percept, previous);
        previous = percept;
        let sawLoading = false;
        for (const cue of cues) {
            byKind[cue.kind] += 1;
            total += 1;
            if (!cue.accessible &&
                (cue.kind === "icon" || cue.kind === "chart" || cue.kind === "media")) {
                unlabeled.push({ kind: cue.kind, screen: percept.url });
            }
            if (cue.kind === "toast")
                toasts.push({ screen: percept.url, label: cue.label });
            if (cue.kind === "loading")
                sawLoading = true;
        }
        if (sawLoading)
            screensWithLoading += 1;
    }
    return {
        perceptor: perceptor.name,
        screensAnalyzed: screens.length,
        totalCues: total,
        byKind,
        unlabeled: unlabeled.slice(0, 30),
        screensWithLoading,
        toasts: toasts.slice(0, 30),
        generatedAt: new Date().toISOString(),
    };
}
/** Analyze the multimodal perception captured across a whole session. */
export function analyzeMultimodal(session, perceptor = DEFAULT_MULTIMODAL_PERCEPTOR) {
    return analyzeScreens(session.capturedScreens, perceptor);
}
//# sourceMappingURL=analyze.js.map