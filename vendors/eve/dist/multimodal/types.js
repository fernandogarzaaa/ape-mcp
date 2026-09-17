/**
 * Multimodal perception — recognizing higher-level visual constructs (icons,
 * charts, loading states, toasts, media, text-in-images, animations) from what
 * a human can actually see on screen.
 *
 * This stays inside EVE's human-perception boundary: cues are derived from the
 * rendered, visible `Percept` (EVE's "retina"), never from DOM internals,
 * routes, or source. The `MultimodalPerceptor` interface is the extension point
 * for richer backends (a real OCR/vision-language model can implement it), with
 * a deterministic heuristic perceptor as the default.
 */
export {};
//# sourceMappingURL=types.js.map