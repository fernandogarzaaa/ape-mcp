/**
 * EVE Bench — a formal benchmark platform. Where `validateBenchmarks` checks a
 * single construct-validity property (excellent > average > bad on the overall
 * score), EVE Bench runs a defined suite of reference apps through the full
 * cognitive simulation and publishes a multi-dimensional scorecard: task
 * success, overall experience, frustration, trust, cognitive load, expectation
 * alignment, and learnability.
 */
import { BENCHMARK_APPS } from "../benchmarks/index.js";
import { MockAdapter } from "../browser/index.js";
import { EveSession } from "../engine/session.js";
import { InMemoryStore } from "../memory/index.js";
const TERMINAL_SIGNAL = {
    excellent: "all set",
    average: "your dashboard",
    bad: "has been created",
};
const DEFAULT_PANEL = ["first-time-user", "impatient-user", "power-user"];
const DEFAULT_GOAL = "create an account and get to the main screen";
/** The default EVE Bench suite: the three known-quality reference apps. */
export const EVEBENCH_CASES = Object.keys(BENCHMARK_APPS).map((tier) => ({
    id: tier,
    tier,
    app: BENCHMARK_APPS[tier],
    goal: DEFAULT_GOAL,
    successSignal: TERMINAL_SIGNAL[tier],
}));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const round = (v, p = 3) => Math.round(v * 10 ** p) / 10 ** p;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
async function scoreCase(bench, panel, seed, maxSteps) {
    const successes = [];
    const overalls = [];
    const frustrations = [];
    const trusts = [];
    const loads = [];
    const alignments = [];
    for (const [i, persona] of panel.entries()) {
        const result = await new EveSession({
            adapter: new MockAdapter(bench.app),
            startUrl: "mock:home",
            persona,
            goal: bench.goal,
            goalSuccessSignals: [bench.successSignal],
            seed: `${seed}#${i}`,
            maxSteps,
            cognitive: true,
        }).run();
        successes.push(result.goalAchieved ? 1 : 0);
        overalls.push(result.scores.find((s) => s.dimension === "overall")?.value ?? 0);
        const emotion = result.emotionTimeline.at(-1)?.values;
        frustrations.push(emotion?.frustration ?? 0);
        trusts.push(emotion?.trust ?? 0.5);
        loads.push(result.cognitiveLoad?.meanIndex ?? 0);
        const exp = result.expectationTimeline ?? [];
        if (exp.length)
            alignments.push(mean(exp.map((e) => e.matchScore)));
    }
    // Learnability: the same operator, twice on the same app, sharing memory —
    // fewer steps the second time means the app is learnable.
    const store = new InMemoryStore();
    const learnPersona = panel[panel.length - 1] ?? "power-user";
    const run1 = await new EveSession({
        adapter: new MockAdapter(bench.app),
        startUrl: "mock:home",
        persona: learnPersona,
        goal: bench.goal,
        goalSuccessSignals: [bench.successSignal],
        seed: `${seed}-learn`,
        maxSteps,
        longTermMemory: store,
    }).run();
    const run2 = await new EveSession({
        adapter: new MockAdapter(bench.app),
        startUrl: "mock:home",
        persona: learnPersona,
        goal: bench.goal,
        goalSuccessSignals: [bench.successSignal],
        seed: `${seed}-learn`,
        maxSteps,
        longTermMemory: store,
    }).run();
    const learnability = run1.usage.steps > 0 ? clamp01(1 - run2.usage.steps / run1.usage.steps) : 0;
    const taskSuccess = round(mean(successes));
    const overallScore = Math.round(mean(overalls));
    const frustration = round(mean(frustrations));
    const trust = round(mean(trusts));
    const cognitiveLoad = Math.round(mean(loads));
    const expectationAlignment = round(mean(alignments));
    // Composite: weighted, higher-is-better (frustration and load inverted).
    const composite = Math.round(taskSuccess * 30 +
        (overallScore / 100) * 25 +
        (1 - frustration) * 15 +
        trust * 10 +
        (1 - cognitiveLoad / 100) * 10 +
        expectationAlignment * 5 +
        learnability * 5);
    return {
        id: bench.id,
        tier: bench.tier,
        taskSuccess,
        overallScore,
        frustration,
        trust,
        cognitiveLoad,
        expectationAlignment,
        learnability: round(learnability),
        composite,
    };
}
/** Run the EVE Bench suite and publish a multi-dimensional scorecard. */
export async function runEveBench(options = {}) {
    const cases = options.cases ?? EVEBENCH_CASES;
    const panel = options.panel ?? DEFAULT_PANEL;
    const seed = options.seed ?? 7;
    const maxSteps = options.maxSteps ?? 40;
    const scores = [];
    for (const bench of cases)
        scores.push(await scoreCase(bench, panel, seed, maxSteps));
    const overall = Math.round(mean(scores.map((s) => s.composite)));
    const excellent = scores.find((s) => s.tier === "excellent")?.composite;
    const average = scores.find((s) => s.tier === "average")?.composite;
    const bad = scores.find((s) => s.tier === "bad")?.composite;
    const ordered = excellent !== undefined && average !== undefined && bad !== undefined
        ? excellent > average && average > bad
        : true;
    return {
        cases: scores,
        overall,
        ordered,
        summary: `EVE Bench overall ${overall}/100 across ${scores.length} cases. ${ordered ? "Construct validity holds (excellent > average > bad)." : "⚠️ Construct validity FAILED — the instrument is miscalibrated."}`,
        generatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=evebench.js.map