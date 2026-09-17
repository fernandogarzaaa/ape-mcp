import type { AdapterName } from "../browser/index.js";
import type { Viewport } from "../core/types.js";
import { type Persona, type PersonaSpec } from "../personas/persona.js";
import type { ExplorationStrategy } from "../planning/strategies.js";
/**
 * YAML configuration for `eve run` and programmatic use.
 * See docs/configuration.md and eve.config.example.yaml.
 */
export interface EveConfig {
    url: string;
    persona: string | Persona;
    browser: AdapterName;
    /** Device to emulate when browser is "mobile" (e.g. "iPhone 14"). */
    device?: string;
    headless: boolean;
    viewport: Viewport;
    goal?: string;
    goalSuccessSignals?: string[];
    seed?: number | string;
    maxSteps: number;
    maxDurationMinutes: number;
    explorationStrategy: ExplorationStrategy;
    screenshots: boolean;
    paceScale: number;
    outputDir: string;
    verbosity: "quiet" | "normal" | "verbose";
    language?: string;
    plugins: {
        accessibility: boolean;
        performance: boolean;
        llmCritic: boolean | {
            model?: string;
            maxScreens?: number;
        };
    };
    llmCognition: boolean | {
        model?: string;
    };
    /** Custom personas defined inline in the config file. */
    customPersonas?: PersonaSpec[];
    /** Enable the enhanced cognitive suite (attention, trust, load, expectation). */
    cognitive: boolean;
    /** Use the utility-based decision policy instead of the heuristic one. */
    utilityDecisions: boolean;
    /** Cultural profile locale (e.g. "de-DE", "ja-JP", "ar-SA"). */
    culture?: string;
    /** Professional overlay (e.g. "doctor", "accountant"). */
    profession?: string;
    /** Path to a JSON file for persistent cross-session memory. */
    longTermMemoryPath?: string;
}
export declare const DEFAULT_CONFIG: Omit<EveConfig, "url">;
/** Validate and normalize a raw (parsed-YAML or object) configuration. */
export declare function resolveConfig(raw: unknown): EveConfig;
export declare function loadConfigFile(path: string): Promise<EveConfig>;
export declare class ConfigError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=config.d.ts.map