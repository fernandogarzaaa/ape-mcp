import { MockAdapter } from "../browser/mock.js";
import { EveSession } from "../engine/session.js";
import { BENCHMARK_APPS } from "./apps.js";
const DEFAULT_PANEL = ["first-time-user", "impatient-user", "office-worker"];
/**
 * The single terminal phrase present on each app's success screen. Each app
 * reaches the same conceptual endpoint (account created), so success is
 * detected identically per tier — only the *path quality* differs.
 */
const TERMINAL_SIGNAL = {
    excellent: "all set",
    average: "your dashboard",
    bad: "has been created",
};
async function runTier(tier, options) {
    const personas = options.personas ?? DEFAULT_PANEL;
    const app = BENCHMARK_APPS[tier];
    const perPersona = [];
    for (const persona of personas) {
        const session = new EveSession({
            adapter: new MockAdapter(app),
            startUrl: "mock:home",
            persona,
            goal: options.goal ?? "create an account and get to the main screen",
            goalSuccessSignals: [TERMINAL_SIGNAL[tier]],
            seed: options.seed ?? 100,
            maxSteps: options.maxSteps ?? 40,
            paceScale: 0,
            cognitive: options.cognitive ?? false,
        });
        const r = await session.run();
        perPersona.push({
            persona,
            score: r.scores.find((s) => s.dimension === "overall")?.value ?? 0,
            completed: r.goalAchieved,
            abandoned: r.abandoned,
        });
    }
    const meanScore = Math.round(perPersona.reduce((a, b) => a + b.score, 0) / perPersona.length);
    return { tier, meanScore, perPersona };
}
/** Run all three tiers and validate the ordering. */
export async function validateBenchmarks(options = {}) {
    const excellent = await runTier("excellent", options);
    const average = await runTier("average", options);
    const bad = await runTier("bad", options);
    const results = [excellent, average, bad];
    const ordered = excellent.meanScore > average.meanScore && average.meanScore > bad.meanScore;
    const separations = {
        excellentVsAverage: excellent.meanScore - average.meanScore,
        averageVsBad: average.meanScore - bad.meanScore,
    };
    const summary = ordered
        ? `EVE preserved expected discrimination on reference fixtures (internal regression): excellent ${excellent.meanScore} > average ${average.meanScore} > bad ${bad.meanScore}. This is NOT human validation.`
        : `Benchmark regression FAILED: excellent ${excellent.meanScore}, average ${average.meanScore}, bad ${bad.meanScore}. EVE is not discriminating the reference fixtures as expected.`;
    return { results, ordered, separations, summary };
}
//# sourceMappingURL=validate.js.map