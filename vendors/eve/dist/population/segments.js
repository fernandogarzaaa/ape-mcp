/**
 * Deterministic, rule-based segmentation of a simulated population into
 * behavioural cohorts — the "expected user segments" a UX researcher reports.
 *
 * Segmentation is intentionally interpretable (first-matching rule wins)
 * rather than a black-box clustering, so every operator's segment can be
 * explained from its outcome and emotional end-state.
 */
const HIGH = 0.5;
const CONFIDENT = 0.6;
const EARLY_STEPS = 6;
/**
 * Ordered rules; the first match classifies the operator. Order matters:
 * abandonment cases first, then quality of completion.
 */
const RULES = [
    {
        key: "early-abandoners",
        name: "Early abandoners",
        description: "Left almost immediately — the landing experience failed to earn a second click.",
        test: (o) => o.abandoned && o.steps <= EARLY_STEPS,
    },
    {
        key: "frustrated-quitters",
        name: "Frustrated quitters",
        description: "Tried for a while, hit friction, and churned with high frustration.",
        test: (o) => o.abandoned,
    },
    {
        key: "confused-wanderers",
        name: "Confused wanderers",
        description: "Never abandoned but never succeeded — kept searching without a clear path.",
        test: (o) => !o.completed && (o.emotions.confusion >= HIGH || o.emotions.confidence < CONFIDENT),
    },
    {
        key: "explorers",
        name: "Explorers",
        description: "Roamed the product with sustained curiosity rather than driving to a goal.",
        test: (o) => !o.completed,
    },
    {
        key: "persistent-strugglers",
        name: "Persistent strugglers",
        description: "Got there in the end, but it cost them — high effort and frustration en route.",
        test: (o) => o.completed && (o.emotions.frustration >= HIGH || o.steps > 20),
    },
    {
        key: "confident-completers",
        name: "Confident completers",
        description: "Sailed through — completed efficiently with high confidence and low frustration.",
        test: (o) => o.completed && o.emotions.confidence >= CONFIDENT && o.emotions.frustration < HIGH,
    },
    {
        key: "steady-completers",
        name: "Steady completers",
        description: "Completed the task without drama — a solid, unremarkable success.",
        test: () => true,
    },
];
/** Classify a single operator into a segment key. */
export function classifySegment(op) {
    for (const rule of RULES) {
        if (rule.test(op))
            return rule.key;
    }
    return "steady-completers";
}
/** Group operators into segments, sorted by size (largest first). */
export function segmentPopulation(operators) {
    const total = operators.length;
    const buckets = new Map();
    for (const op of operators) {
        const key = classifySegment(op);
        const list = buckets.get(key) ?? [];
        list.push(op);
        buckets.set(key, list);
    }
    const segments = [];
    for (const rule of RULES) {
        const members = buckets.get(rule.key);
        if (!members || members.length === 0)
            continue;
        const scores = members.map((m) => m.overall);
        const steps = members.map((m) => m.steps);
        segments.push({
            key: rule.key,
            name: rule.name,
            description: rule.description,
            size: members.length,
            share: total > 0 ? Math.round((members.length / total) * 1000) / 1000 : 0,
            meanScore: Math.round((scores.reduce((a, b) => a + b, 0) / members.length) * 10) / 10,
            meanSteps: Math.round((steps.reduce((a, b) => a + b, 0) / members.length) * 10) / 10,
        });
    }
    return segments.sort((a, b) => b.size - a.size);
}
//# sourceMappingURL=segments.js.map