/**
 * Experience Validation Engine (EVE)
 * "AI that experiences software like a human."
 *
 * Public API surface. See docs/api-reference.md for the guided tour.
 *
 * Two subsystems are reached through their own subpath exports rather than
 * this barrel, because both declare types whose names (`Observation`,
 * `Experience`, `Provenance`, `Measurement`) are deliberately generic on the
 * wire and would collide with EVE's own vocabulary if flattened into one
 * namespace:
 *
 * - `experience-validation-engine/protocol` — the CP/1 binding, by which EVE,
 *   ADAM and AXIOM-AETHER exchange documents as one organism.
 * - `experience-validation-engine/fitness` — counterfactual fitness
 *   measurement, EVE's role in the developmental lifecycle.
 */
export * from "./appmap/index.js";
export * from "./benchmarks/index.js";
export * from "./browser/index.js";
export * from "./calibration/index.js";
export * from "./cognition/index.js";
export * from "./collaborative/index.js";
export * from "./config/index.js";
export * from "./conversation/index.js";
export type { EveEventMap, EveEventName } from "./core/events.js";
export { EventBus } from "./core/events.js";
export { findingCategoryRegistry, registerFindingCategory } from "./core/findingCategories.js";
export type { Affordance, AffordanceLocator, ContentBlock, ConversationalKernelPercept, DocumentKernelPercept, FrameIdentity, KernelAction, KernelPercept, SurfaceSignal, TextualKernelPercept, VisualKernelPercept, } from "./core/kernel.js";
export type { Rng } from "./core/random.js";
export { createRng, seedFromString } from "./core/random.js";
export type { ActionVerbEntry, EveRegistries, FindingCategoryEntry, Modality, RegistryEntry, ScoreDimensionEntry, } from "./core/registry.js";
export { ALL_MODALITIES, EveRegistry } from "./core/registry.js";
export type { Action, BoundingBox, EvidenceProvenance, Finding, FindingCategory, FindingSeverity, LatencyEvidence, LoopIteration, ObservationSource, PerceivedRole, Percept, Point, Prediction, PredictionOutcome, Score, ScoreDimension, SessionUsage, Viewport, VisibleDialog, VisibleElement, } from "./core/types.js";
export { describeAction, FINDING_CATEGORIES, SCORE_DIMENSIONS } from "./core/types.js";
export * from "./emotion/index.js";
export type { CognitiveConfig, CognitiveLoadTimeline } from "./engine/cognitiveSuite.js";
export { CognitiveSuite } from "./engine/cognitiveSuite.js";
export type { SessionOptions, SessionResult } from "./engine/session.js";
export { EveSession } from "./engine/session.js";
export * from "./evebench/index.js";
export * from "./forecasting/index.js";
export * from "./humanity/index.js";
export * from "./mcpEval/index.js";
export * from "./memory/index.js";
export * from "./multimodal/index.js";
export * from "./observation/index.js";
export * from "./panel/index.js";
export * from "./personas/index.js";
export * from "./planning/index.js";
export * from "./plugins/index.js";
export * from "./population/index.js";
export * from "./predict/index.js";
export * from "./product/index.js";
export * from "./regression/index.js";
export * from "./rendering/index.js";
export { RENDERING_CATEGORY, RENDERING_DIMENSION, registerRenderingVocabulary, } from "./rendering/vocabulary.js";
export * from "./reporting/index.js";
export * from "./research/index.js";
export * from "./scoring/index.js";
export * from "./study/index.js";
export type { SurfaceCapabilities } from "./surface/capabilities.js";
export { CONVERSATION_VERBS, CONVERSATIONAL_SURFACE, DOCUMENT_SURFACE, DOCUMENT_VERBS, TEXTUAL_SURFACE, TOUCH_VISUAL_SURFACE, VISUAL_SURFACE, } from "./surface/capabilities.js";
export { CliAdapter, type CliAdapterOptions } from "./surface/cli.js";
export { McpAdapter, type McpAdapterOptions } from "./surface/mcp.js";
export { connectMcpInProcess, connectMcpServer, type McpCallOutcome, type McpConnection, type McpConnector, } from "./surface/mcpClient.js";
export * from "./trends/index.js";
export * from "./twins/index.js";
export * from "./vision/index.js";
export * from "./workflow/index.js";
//# sourceMappingURL=index.d.ts.map