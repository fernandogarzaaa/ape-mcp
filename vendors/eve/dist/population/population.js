/**
 * Population simulation — run many varied operators against the same app and
 * aggregate their experiences statistically. Where a single {@link EveSession}
 * answers "how did this one person do?", a population study answers "how does
 * the distribution of real humans do?": success/drop-off rates, confidence and
 * frustration distributions, a task-completion histogram, a navigation
 * heatmap, and the expected user segments.
 *
 * It composes existing sessions without changing them: each operator is an
 * ordinary seeded {@link EveSession}, so a study is as reproducible as its
 * seed. Fully offline against the `mock:` app.
 */
import { createAdapter } from "../browser/index.js";
import { HeuristicCognition } from "../cognition/heuristicCognition.js";
import { UtilityCognition } from "../cognition/utilityCognition.js";
import { EMOTION_KEYS } from "../emotion/emotionalState.js";
import { EveSession } from "../engine/session.js";
import { applyProfession, getCulture, getPersona, getProfession, listPersonas, } from "../personas/index.js";
import { classifySegment, segmentPopulation } from "./segments.js";
import { histogram, summarize } from "./stats.js";
const MAX_HEATMAP_ROWS = 20;
const MAX_TOP_FINDINGS = 15;
/** Sort key for finding severities (critical first). */
function severityRank(severity) {
    switch (severity) {
        case "critical":
            return 0;
        case "major":
            return 1;
        case "minor":
            return 2;
        default:
            return 3;
    }
}
/** Build the deterministic roster of operators to simulate. */
export function sampleOperators(options) {
    const size = Math.max(1, Math.floor(options.size ?? 25));
    const base = String(options.seed ?? 1);
    const personaPool = options.personas && options.personas.length > 0
        ? options.personas
        : listPersonas().map((p) => p.name);
    const professions = options.professions ?? [];
    const cultures = options.cultures ?? [];
    const specs = [];
    for (let i = 0; i < size; i += 1) {
        const persona = personaPool[i % personaPool.length];
        specs.push({
            index: i,
            persona,
            seed: `${base}#${i}`,
            ...(professions.length ? { profession: professions[i % professions.length] } : {}),
            ...(cultures.length ? { culture: cultures[i % cultures.length] } : {}),
        });
    }
    return specs;
}
/** The operator's end-state emotion vector (zeros if no timeline). */
function finalEmotions(result) {
    const last = result.emotionTimeline.at(-1);
    if (last)
        return { ...last.values };
    const zero = {};
    for (const key of EMOTION_KEYS)
        zero[key] = 0;
    return zero;
}
/** Run one operator's session and return its outcome plus its findings. */
async function runOperator(spec, options, browser, policy) {
    let persona = getPersona(spec.persona);
    if (spec.profession)
        persona = applyProfession(persona, getProfession(spec.profession));
    const culture = spec.culture ? getCulture(spec.culture).locale : undefined;
    const adapter = options.adapterFactory
        ? options.adapterFactory(spec)
        : createAdapter(browser, { headless: true });
    const result = await new EveSession({
        adapter,
        startUrl: options.url,
        persona,
        policy,
        goal: options.goal,
        goalSuccessSignals: options.goalSuccessSignals ? [...options.goalSuccessSignals] : undefined,
        seed: spec.seed,
        maxSteps: options.maxSteps ?? 60,
        maxDurationMs: options.maxDurationMs ?? 10 * 60 * 1000,
        screenshots: (options.screenshots ?? false) && browser !== "mock",
        cognitive: options.cognitive ?? false,
        culture,
    }).run();
    const emotions = finalEmotions(result);
    const overall = result.scores.find((s) => s.dimension === "overall")?.value ?? 0;
    const completed = options.goal ? result.goalAchieved : !result.abandoned;
    const path = result.iterations.map((it) => it.url);
    const run = {
        index: spec.index,
        persona: result.personaName,
        profession: spec.profession ?? null,
        culture: result.culture,
        seed: spec.seed,
        overall,
        completed,
        goalAchieved: result.goalAchieved,
        abandoned: result.abandoned,
        abandonReason: result.abandonReason,
        endReason: result.endReason,
        steps: result.usage.steps,
        durationMinutes: Number((result.usage.durationMs / 60000).toFixed(1)),
        screensVisited: result.usage.screensVisited,
        findings: result.findings.length,
        criticalFindings: result.findings.filter((f) => f.severity === "critical").length,
        emotions,
        segment: classifySegment({
            completed,
            abandoned: result.abandoned,
            steps: result.usage.steps,
            overall,
            emotions,
        }),
        path,
        dropoffScreen: result.abandoned ? (path.at(-1) ?? null) : null,
    };
    return { run, result };
}
/** Merge one operator's distinct findings into the population accumulator. */
function accumulateFindings(result, into) {
    const seen = new Set();
    for (const f of result.findings) {
        if (seen.has(f.title))
            continue;
        seen.add(f.title);
        const existing = into.get(f.title);
        if (existing) {
            existing.count += 1;
        }
        else {
            into.set(f.title, {
                severity: f.severity,
                category: f.category,
                count: 1,
                evidence: f.evidence[0] ?? null,
                recommendation: f.recommendation ?? null,
            });
        }
    }
}
/** Aggregate per-screen visits, reach, and drop-offs across the population. */
function buildHeatmap(operators) {
    const visits = new Map();
    const operatorsOn = new Map();
    const dropoffs = new Map();
    const size = operators.length;
    for (const op of operators) {
        const seen = new Set();
        for (const screen of op.path) {
            visits.set(screen, (visits.get(screen) ?? 0) + 1);
            seen.add(screen);
        }
        for (const screen of seen)
            operatorsOn.set(screen, (operatorsOn.get(screen) ?? 0) + 1);
        if (op.dropoffScreen)
            dropoffs.set(op.dropoffScreen, (dropoffs.get(op.dropoffScreen) ?? 0) + 1);
    }
    return [...visits.entries()]
        .map(([screen, v]) => ({
        screen,
        visits: v,
        operators: operatorsOn.get(screen) ?? 0,
        reach: size > 0 ? Math.round(((operatorsOn.get(screen) ?? 0) / size) * 1000) / 1000 : 0,
        dropoffs: dropoffs.get(screen) ?? 0,
    }))
        .sort((a, b) => b.visits - a.visits || b.dropoffs - a.dropoffs)
        .slice(0, MAX_HEATMAP_ROWS);
}
/**
 * Simulate a population of operators and aggregate the results into a
 * {@link PopulationStudy}. Deterministic for a fixed `seed`, `size`, and pool.
 */
export async function simulatePopulation(options) {
    const isMock = options.url.startsWith("mock:");
    const browser = options.adapterFactory
        ? "mock" // ignored — the factory supplies adapters
        : (options.browser ?? (isMock ? "mock" : "playwright"));
    const policy = options.utility
        ? new UtilityCognition()
        : new HeuristicCognition();
    const specs = sampleOperators(options);
    const runs = new Array(specs.length);
    const findingRecords = new Map();
    const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
    let next = 0;
    let done = 0;
    const worker = async () => {
        while (next < specs.length) {
            const i = next;
            next += 1;
            const { run, result } = await runOperator(specs[i], options, browser, policy);
            runs[i] = run;
            accumulateFindings(result, findingRecords);
            done += 1;
            options.onProgress?.(done, specs.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, specs.length) }, () => worker()));
    const size = runs.length;
    const completed = runs.filter((r) => r.completed).length;
    const abandoned = runs.filter((r) => r.abandoned).length;
    const endReasonBreakdown = {};
    for (const r of runs)
        endReasonBreakdown[r.endReason] = (endReasonBreakdown[r.endReason] ?? 0) + 1;
    const stepsCompleted = runs.filter((r) => r.completed).map((r) => r.steps);
    const topFindings = [...findingRecords.entries()]
        .map(([title, f]) => ({
        title,
        severity: f.severity,
        category: f.category,
        operatorsAffected: f.count,
        prevalence: size > 0 ? Math.round((f.count / size) * 1000) / 1000 : 0,
        evidence: f.evidence,
        recommendation: f.recommendation,
    }))
        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) ||
        b.operatorsAffected - a.operatorsAffected)
        .slice(0, MAX_TOP_FINDINGS);
    return {
        url: options.url,
        label: options.label ?? options.url,
        size,
        goal: options.goal ?? null,
        successRate: size > 0 ? Math.round((completed / size) * 1000) / 1000 : 0,
        dropoffRate: size > 0 ? Math.round((abandoned / size) * 1000) / 1000 : 0,
        endReasonBreakdown,
        overallScore: summarize(runs.map((r) => r.overall)),
        confidence: summarize(runs.map((r) => r.emotions.confidence)),
        frustration: summarize(runs.map((r) => r.emotions.frustration)),
        trust: summarize(runs.map((r) => r.emotions.trust)),
        stepsToComplete: summarize(stepsCompleted),
        completionHistogram: histogram(stepsCompleted),
        navigationHeatmap: buildHeatmap(runs),
        segments: segmentPopulation(runs),
        topFindings,
        operators: runs,
        generatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=population.js.map