/**
 * Core implementations behind the EVE MCP tools.
 *
 * These functions are deliberately transport-agnostic and side-effect-light
 * (they never write to stdout), so they can be unit-tested directly and reused
 * programmatically. `server.ts` is a thin adapter that wires them to the MCP
 * TypeScript SDK.
 *
 * Each returns `{ markdown, structured }`: a human-readable rendering plus the
 * full machine-readable object, letting callers pick a response format.
 */
import type { ApplicationMapInput, BenchmarkInput, CalibrateInput, CompareBuildsInput, EvaluateConversationInput, EveBenchInput, GetReportInput, MultimodalScanInput, ReadArtifactInput, RunSessionInput, RunUsabilityStudyInput, TwinSessionInput } from "./schemas.js";
/** Maximum characters returned in a single tool response before truncation. */
export declare const CHARACTER_LIMIT = 25000;
export interface ToolOutput {
    readonly markdown: string;
    readonly structured: Record<string, unknown>;
}
/**
 * A caller-facing error whose message is safe and actionable to surface to an
 * LLM. Thrown for bad input (unknown persona, missing browser, …).
 */
export declare class ToolInputError extends Error {
    readonly name = "ToolInputError";
}
/**
 * Run one simulated-human session and write the full report to disk.
 * Progress is not logged to stdout (safe for stdio MCP transport); set
 * EVE_MCP_DEBUG=1 to route progress to stderr.
 */
export declare function runSession(input: RunSessionInput): Promise<ToolOutput>;
export declare function runUsabilityStudy(input: RunUsabilityStudyInput): Promise<ToolOutput>;
/**
 * Run a full AI-moderated user study: simulate a population, then convene the
 * specialist panel (UX Researcher, Interaction Designer, Accessibility
 * Specialist, QA Engineer, Behavioral Psychologist, Product Manager) and the
 * moderator synthesis. Returns an executive report with a release verdict.
 */
export declare function runUserStudy(input: RunUsabilityStudyInput): Promise<ToolOutput>;
/**
 * Run a population, then infer product intelligence from how it behaved:
 * personas, business goals, critical workflows, feature importance,
 * high-friction pages, and drop-off causes.
 */
export declare function runProductReport(input: RunUsabilityStudyInput): Promise<ToolOutput>;
/**
 * Study several builds and analyze the experience trend across them —
 * detecting improvements and regressions in success, drop-off, score,
 * confidence, frustration, trust, and effort.
 */
export declare function compareBuilds(input: CompareBuildsInput): Promise<ToolOutput>;
/**
 * Run a population, then produce heuristic simulation estimates (NOT
 * population inference) — confusion/abandonment simulation ranges,
 * onboarding/accessibility estimates, and a heuristic support-contact
 * scenario score, each with explicit provenance and calibration status.
 */
export declare function runPredictUX(input: RunUsabilityStudyInput): Promise<ToolOutput>;
/**
 * Calibrate EVE against a human study: load anonymized human traces from a
 * file, run a matching EVE population, and score the simulation's realism.
 */
export declare function runCalibrate(input: CalibrateInput): Promise<ToolOutput>;
/**
 * Run one session as a persistent digital twin, creating it on first use and
 * persisting its evolved profile (expertise, confidence, memory) to disk.
 */
export declare function runTwinSessionTool(input: TwinSessionInput): Promise<ToolOutput>;
/**
 * Explore an app and analyze its multimodal perception — icons, charts, media,
 * loading states, toasts, and text-in-images — surfacing unlabeled visuals.
 */
export declare function runMultimodalScan(input: MultimodalScanInput): Promise<ToolOutput>;
/**
 * Read a digital output like a human and report what the reader understood.
 *
 * The reading counterpart of `runSession`: the artifact is received rather
 * than driven, so the result carries a comprehension analysis alongside the
 * ordinary session scores and findings.
 */
export declare function runReadArtifact(input: ReadArtifactInput): Promise<ToolOutput>;
/**
 * Talk to a conversational surface as a simulated person and report the
 * experience — what it understood, what it missed, and where they gave up.
 */
export declare function runEvaluateConversation(input: EvaluateConversationInput): Promise<ToolOutput>;
/**
 * Autonomously explore an app with several curious operators and reconstruct
 * its application map: screens, navigation graph, information architecture,
 * hubs, dead-ends, and unexercised affordances.
 */
export declare function runApplicationMap(input: ApplicationMapInput): Promise<ToolOutput>;
/** List the built-in personas. */
export declare function listPersonasTool(): ToolOutput;
/** List the professional overlays. */
export declare function listProfessionsTool(): ToolOutput;
/** List the cultural profiles. */
export declare function listCulturesTool(): ToolOutput;
/** Run the formal EVE Bench multi-dimensional benchmark platform. */
export declare function runEveBenchTool(input: EveBenchInput): Promise<ToolOutput>;
/** Validate EVE against the known-quality benchmark apps (internal discrimination regression — NOT human validation). */
export declare function runBenchmark(input: BenchmarkInput): Promise<ToolOutput>;
/** Read a previously written report back from disk. */
export declare function getReport(input: GetReportInput): Promise<ToolOutput>;
//# sourceMappingURL=tools.d.ts.map