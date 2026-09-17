import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { DEVICE_PRESETS } from "../browser/mobile.js";
import { getPersona } from "../personas/library.js";
import { definePersona } from "../personas/persona.js";
export const DEFAULT_CONFIG = {
    persona: "first-time-user",
    browser: "playwright",
    headless: true,
    viewport: { width: 1280, height: 800 },
    maxSteps: 60,
    maxDurationMinutes: 10,
    explorationStrategy: "curious",
    screenshots: true,
    paceScale: 0.15,
    outputDir: ".eve-output",
    verbosity: "normal",
    plugins: { accessibility: true, performance: true, llmCritic: false },
    llmCognition: false,
    cognitive: false,
    utilityDecisions: false,
};
const ADAPTERS = ["playwright", "puppeteer", "selenium", "mobile", "mock"];
const STRATEGIES = ["curious", "systematic", "goal-directed"];
/** Validate and normalize a raw (parsed-YAML or object) configuration. */
export function resolveConfig(raw) {
    if (typeof raw !== "object" || raw === null) {
        throw new ConfigError("Configuration must be a mapping/object");
    }
    const input = raw;
    const config = {
        ...DEFAULT_CONFIG,
        url: expectString(input, "url"),
        plugins: { ...DEFAULT_CONFIG.plugins },
        viewport: { ...DEFAULT_CONFIG.viewport },
    };
    if (input.persona !== undefined)
        config.persona = expectString(input, "persona");
    if (input.browser !== undefined) {
        const browser = expectString(input, "browser");
        if (!ADAPTERS.includes(browser)) {
            throw new ConfigError(`browser must be one of ${ADAPTERS.join(", ")}; got "${browser}"`);
        }
        config.browser = browser;
    }
    if (input.device !== undefined) {
        const device = expectString(input, "device");
        if (!Object.hasOwn(DEVICE_PRESETS, device)) {
            throw new ConfigError(`device must be one of ${Object.keys(DEVICE_PRESETS).join(", ")}; got "${device}"`);
        }
        config.device = device;
    }
    if (input.headless !== undefined)
        config.headless = expectBoolean(input, "headless");
    if (input.viewport !== undefined) {
        if (typeof input.viewport !== "object" ||
            input.viewport === null ||
            Array.isArray(input.viewport)) {
            throw new ConfigError("viewport must be an object with width and height");
        }
        const v = input.viewport;
        config.viewport = {
            width: expectNumber(v, "width", 320, 7680),
            height: expectNumber(v, "height", 240, 4320),
        };
    }
    if (input.goal !== undefined)
        config.goal = expectString(input, "goal");
    if (input.goalSuccessSignals !== undefined) {
        config.goalSuccessSignals = expectStringArray(input, "goalSuccessSignals");
    }
    if (input.seed !== undefined) {
        const seed = input.seed;
        if (typeof seed !== "number" && typeof seed !== "string") {
            throw new ConfigError("seed must be a number or string");
        }
        config.seed = seed;
    }
    if (input.maxSteps !== undefined)
        config.maxSteps = expectNumber(input, "maxSteps", 1, 100000);
    if (input.maxDurationMinutes !== undefined) {
        config.maxDurationMinutes = expectNumber(input, "maxDurationMinutes", 0.1, 24 * 60);
    }
    if (input.explorationStrategy !== undefined) {
        const strategy = expectString(input, "explorationStrategy");
        if (!STRATEGIES.includes(strategy)) {
            throw new ConfigError(`explorationStrategy must be one of ${STRATEGIES.join(", ")}`);
        }
        config.explorationStrategy = strategy;
    }
    if (input.screenshots !== undefined)
        config.screenshots = expectBoolean(input, "screenshots");
    if (input.paceScale !== undefined)
        config.paceScale = expectNumber(input, "paceScale", 0, 2);
    if (input.patience !== undefined) {
        // Convenience: patience override without a full custom persona.
        const patience = expectNumber(input, "patience", 0, 1);
        const base = typeof config.persona === "string" ? getPersona(config.persona) : config.persona;
        config.persona = definePersona({
            name: `${base.name}+patience`,
            description: base.description,
            traits: { ...base.traits, patience },
            accessibility: base.accessibility,
            disposition: base.disposition,
        });
    }
    if (input.outputDir !== undefined)
        config.outputDir = expectString(input, "outputDir");
    if (input.verbosity !== undefined) {
        const verbosity = expectString(input, "verbosity");
        if (!["quiet", "normal", "verbose"].includes(verbosity)) {
            throw new ConfigError("verbosity must be quiet|normal|verbose");
        }
        config.verbosity = verbosity;
    }
    if (input.language !== undefined)
        config.language = expectString(input, "language");
    if (input.plugins !== undefined) {
        if (typeof input.plugins !== "object" ||
            input.plugins === null ||
            Array.isArray(input.plugins)) {
            throw new ConfigError("plugins must be an object");
        }
        const p = input.plugins;
        if (p.accessibility !== undefined)
            config.plugins.accessibility = expectBoolean(p, "accessibility");
        if (p.performance !== undefined)
            config.plugins.performance = expectBoolean(p, "performance");
        if (p.llmCritic !== undefined) {
            config.plugins.llmCritic =
                typeof p.llmCritic === "object" && p.llmCritic !== null
                    ? p.llmCritic
                    : expectBoolean(p, "llmCritic");
        }
    }
    if (input.llmCognition !== undefined) {
        config.llmCognition =
            typeof input.llmCognition === "object" && input.llmCognition !== null
                ? input.llmCognition
                : expectBoolean(input, "llmCognition");
    }
    if (input.customPersonas !== undefined) {
        if (!Array.isArray(input.customPersonas)) {
            throw new ConfigError("customPersonas must be an array of persona specs");
        }
        config.customPersonas = input.customPersonas;
        // Validate each spec eagerly so config errors surface before the run.
        for (const spec of config.customPersonas)
            definePersona(spec);
    }
    if (input.cognitive !== undefined)
        config.cognitive = expectBoolean(input, "cognitive");
    if (input.utilityDecisions !== undefined)
        config.utilityDecisions = expectBoolean(input, "utilityDecisions");
    if (input.culture !== undefined)
        config.culture = expectString(input, "culture");
    if (input.profession !== undefined)
        config.profession = expectString(input, "profession");
    if (input.longTermMemoryPath !== undefined) {
        config.longTermMemoryPath = expectString(input, "longTermMemoryPath");
    }
    return config;
}
export async function loadConfigFile(path) {
    const text = await readFile(path, "utf8");
    const raw = parse(text);
    return resolveConfig(raw);
}
export class ConfigError extends Error {
    constructor(message) {
        super(`EVE config: ${message}`);
        this.name = "ConfigError";
    }
}
/* ---------------- validation helpers ---------------- */
function expectString(obj, key) {
    const v = obj[key];
    if (typeof v !== "string" || v.length === 0) {
        throw new ConfigError(`"${key}" must be a non-empty string`);
    }
    return v;
}
function expectBoolean(obj, key) {
    const v = obj[key];
    if (typeof v !== "boolean")
        throw new ConfigError(`"${key}" must be true or false`);
    return v;
}
function expectNumber(obj, key, min, max) {
    const v = obj[key];
    if (typeof v !== "number" || Number.isNaN(v))
        throw new ConfigError(`"${key}" must be a number`);
    if (v < min || v > max)
        throw new ConfigError(`"${key}"=${v} out of range ${min}..${max}`);
    return v;
}
function expectStringArray(obj, key) {
    const v = obj[key];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
        throw new ConfigError(`"${key}" must be an array of strings`);
    }
    return v;
}
//# sourceMappingURL=config.js.map