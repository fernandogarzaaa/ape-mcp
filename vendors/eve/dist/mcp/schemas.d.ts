/**
 * Zod input schemas for the EVE MCP server tools.
 *
 * These are the single source of truth for tool inputs: the server passes the
 * `.shape` of each object to `registerTool`, and the tool implementations in
 * `tools.ts` consume the inferred types.
 */
import { z } from "zod";
export declare enum ResponseFormat {
    MARKDOWN = "markdown",
    JSON = "json"
}
export declare enum BrowserBackend {
    MOCK = "mock",
    PLAYWRIGHT = "playwright",
    PUPPETEER = "puppeteer",
    SELENIUM = "selenium",
    MOBILE = "mobile"
}
/** `eve_run_session` — run one simulated-human session. */
export declare const RunSessionSchema: z.ZodObject<{
    url: z.ZodString;
    persona: z.ZodDefault<z.ZodString>;
    goal: z.ZodOptional<z.ZodString>;
    goal_success_signals: z.ZodDefault<z.ZodArray<z.ZodString>>;
    profession: z.ZodOptional<z.ZodString>;
    culture: z.ZodOptional<z.ZodString>;
    browser: z.ZodOptional<z.ZodEnum<typeof BrowserBackend>>;
    device: z.ZodOptional<z.ZodString>;
    max_steps: z.ZodDefault<z.ZodNumber>;
    max_minutes: z.ZodDefault<z.ZodNumber>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    cognitive: z.ZodDefault<z.ZodBoolean>;
    utility: z.ZodDefault<z.ZodBoolean>;
    remember_file: z.ZodOptional<z.ZodString>;
    output_dir: z.ZodDefault<z.ZodString>;
    screenshots: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_run_usability_study` — simulate a population and aggregate it. */
export declare const RunUsabilityStudySchema: z.ZodObject<{
    url: z.ZodString;
    size: z.ZodDefault<z.ZodNumber>;
    personas: z.ZodDefault<z.ZodArray<z.ZodString>>;
    professions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    cultures: z.ZodDefault<z.ZodArray<z.ZodString>>;
    goal: z.ZodOptional<z.ZodString>;
    goal_success_signals: z.ZodDefault<z.ZodArray<z.ZodString>>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    max_steps: z.ZodDefault<z.ZodNumber>;
    cognitive: z.ZodDefault<z.ZodBoolean>;
    utility: z.ZodDefault<z.ZodBoolean>;
    browser: z.ZodOptional<z.ZodEnum<typeof BrowserBackend>>;
    concurrency: z.ZodDefault<z.ZodNumber>;
    output_dir: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_bench` — run the formal EVE Bench multi-dimensional benchmark suite. */
export declare const EveBenchSchema: z.ZodObject<{
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    max_steps: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_multimodal_scan` — perceive higher-level visual cues across an app. */
export declare const MultimodalScanSchema: z.ZodObject<{
    url: z.ZodString;
    persona: z.ZodDefault<z.ZodString>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    max_steps: z.ZodDefault<z.ZodNumber>;
    browser: z.ZodOptional<z.ZodEnum<typeof BrowserBackend>>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/**
 * `eve_read_artifact` — read a digital output like a human.
 *
 * The reading counterpart of `eve_run_session`: the target is something the
 * operator *receives* rather than drives (a report, a deck, an analytics
 * export, a `--help` screen, a transcript, an API payload).
 */
export declare const ReadArtifactSchema: z.ZodObject<{
    target: z.ZodString;
    persona: z.ZodDefault<z.ZodString>;
    profession: z.ZodOptional<z.ZodString>;
    genre: z.ZodOptional<z.ZodEnum<{
        analytics: "analytics";
        data: "data";
        document: "document";
        interface: "interface";
        presentation: "presentation";
        transcript: "transcript";
    }>>;
    format: z.ZodOptional<z.ZodEnum<{
        csv: "csv";
        html: "html";
        json: "json";
        markdown: "markdown";
        slides: "slides";
        text: "text";
        transcript: "transcript";
        yaml: "yaml";
    }>>;
    goal: z.ZodOptional<z.ZodString>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    max_steps: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/**
 * `eve_evaluate_conversation` — talk to something that answers back.
 *
 * The conversational counterpart of `eve_run_session`: the target replies
 * rather than being driven or read.
 */
export declare const EvaluateConversationSchema: z.ZodObject<{
    target: z.ZodString;
    persona: z.ZodDefault<z.ZodString>;
    profession: z.ZodOptional<z.ZodString>;
    goal: z.ZodDefault<z.ZodString>;
    goal_success_signals: z.ZodDefault<z.ZodArray<z.ZodString>>;
    kind: z.ZodOptional<z.ZodEnum<{
        assistant: "assistant";
        copilot: "copilot";
        scripted: "scripted";
        support: "support";
    }>>;
    reply_path: z.ZodOptional<z.ZodString>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body_template: z.ZodOptional<z.ZodString>;
    max_turns: z.ZodDefault<z.ZodNumber>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_calibrate` — score EVE's realism against a human study. */
export declare const CalibrateSchema: z.ZodObject<{
    human_file: z.ZodString;
    url: z.ZodString;
    size: z.ZodDefault<z.ZodNumber>;
    goal: z.ZodOptional<z.ZodString>;
    goal_success_signals: z.ZodDefault<z.ZodArray<z.ZodString>>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    max_steps: z.ZodDefault<z.ZodNumber>;
    concurrency: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_twin_session` — run one session as a persistent, evolving digital twin. */
export declare const TwinSessionSchema: z.ZodObject<{
    twin_file: z.ZodString;
    twin_id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    base_persona: z.ZodOptional<z.ZodString>;
    profession: z.ZodOptional<z.ZodString>;
    culture: z.ZodOptional<z.ZodString>;
    url: z.ZodString;
    goal: z.ZodOptional<z.ZodString>;
    goal_success_signals: z.ZodDefault<z.ZodArray<z.ZodString>>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    max_steps: z.ZodDefault<z.ZodNumber>;
    cognitive: z.ZodDefault<z.ZodBoolean>;
    browser: z.ZodOptional<z.ZodEnum<typeof BrowserBackend>>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_application_map` — autonomously explore an app and map it. */
export declare const ApplicationMapSchema: z.ZodObject<{
    url: z.ZodString;
    explorers: z.ZodDefault<z.ZodNumber>;
    personas: z.ZodDefault<z.ZodArray<z.ZodString>>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    max_steps: z.ZodDefault<z.ZodNumber>;
    browser: z.ZodOptional<z.ZodEnum<typeof BrowserBackend>>;
    output_dir: z.ZodOptional<z.ZodString>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_compare_builds` — trend experience across an ordered series of builds. */
export declare const CompareBuildsSchema: z.ZodObject<{
    builds: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    size: z.ZodDefault<z.ZodNumber>;
    goal: z.ZodOptional<z.ZodString>;
    goal_success_signals: z.ZodDefault<z.ZodArray<z.ZodString>>;
    seed: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    max_steps: z.ZodDefault<z.ZodNumber>;
    cognitive: z.ZodDefault<z.ZodBoolean>;
    utility: z.ZodDefault<z.ZodBoolean>;
    concurrency: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** Shared shape for the catalog-listing tools. */
export declare const ListSchema: z.ZodObject<{
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_benchmark` — validate EVE against known-quality reference apps. */
export declare const BenchmarkSchema: z.ZodObject<{
    cognitive: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
}, z.core.$strict>;
/** `eve_get_report` — read a previously written report back. */
export declare const GetReportSchema: z.ZodObject<{
    output_dir: z.ZodDefault<z.ZodString>;
    format: z.ZodDefault<z.ZodEnum<{
        json: "json";
        markdown: "markdown";
    }>>;
}, z.core.$strict>;
export type RunSessionInput = z.infer<typeof RunSessionSchema>;
export type RunUsabilityStudyInput = z.infer<typeof RunUsabilityStudySchema>;
export type CompareBuildsInput = z.infer<typeof CompareBuildsSchema>;
export type ApplicationMapInput = z.infer<typeof ApplicationMapSchema>;
export type TwinSessionInput = z.infer<typeof TwinSessionSchema>;
export type CalibrateInput = z.infer<typeof CalibrateSchema>;
export type MultimodalScanInput = z.infer<typeof MultimodalScanSchema>;
export type ReadArtifactInput = z.infer<typeof ReadArtifactSchema>;
export type EvaluateConversationInput = z.infer<typeof EvaluateConversationSchema>;
export type EveBenchInput = z.infer<typeof EveBenchSchema>;
export type ListInput = z.infer<typeof ListSchema>;
export type BenchmarkInput = z.infer<typeof BenchmarkSchema>;
export type GetReportInput = z.infer<typeof GetReportSchema>;
//# sourceMappingURL=schemas.d.ts.map