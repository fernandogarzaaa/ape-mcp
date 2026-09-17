/**
 * Product intelligence — infer *product* insight from a population study, not
 * just UX findings. Given how a population actually moved through an app, this
 * reconstructs the personas it reveals, the workflows people traverse, the
 * business goals those workflows serve, which features matter, where friction
 * concentrates, and what causes drop-off.
 *
 * Everything is derived deterministically from observed behaviour (operator
 * paths, segments, the navigation heatmap, and prevalence-ranked findings) — no
 * app source is inspected, preserving EVE's human-perception boundary.
 */
/** Short, human-facing screen name (last path segment). */
function shortName(screen) {
    const cleaned = screen.replace(/[#?].*$/, "").replace(/\/+$/, "");
    const parts = cleaned.split(/[/:]/).filter(Boolean);
    return parts.at(-1) ?? screen;
}
const round = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;
/** Keyword → business-goal classification for a screen name. */
// Ordered rules (first match wins). Cover product/tool/console vocabulary —
// not just web-commerce funnels — so non-e-commerce apps still yield insight.
const GOAL_RULES = [
    {
        goal: "User acquisition (signup)",
        pattern: /sign-?up|register|create-?account|get-?started|trial|onboard/i,
    },
    {
        goal: "Monetization",
        pattern: /pricing|plan|upgrade|billing|checkout|purchase|buy|subscribe|cart/i,
    },
    { goal: "Returning-user access", pattern: /log-?in|sign-?in|\bauth\b/i },
    {
        goal: "Help & documentation",
        pattern: /\bdocs?\b|documentation|guide|help|tutorial|readme|reference/i,
    },
    {
        goal: "Reporting & analytics",
        pattern: /report|analytics|insights|summary|scorecard|metrics|\bstats?\b/i,
    },
    // Only unambiguous task verbs — generic nouns like "study"/"session" would
    // otherwise pull config/new-item screens into execution (first-match wins).
    {
        goal: "Task execution",
        pattern: /\brun(?:ning)?\b|execute|process(?:ing)?|\bjob\b|build|scan|render/i,
    },
    {
        goal: "Configuration & setup",
        pattern: /settings|preferences|profile|account|config|setup|\bnew\b|options/i,
    },
    { goal: "Data portability / retention", pattern: /export|download|backup|import/i },
    { goal: "Core product engagement", pattern: /dashboard|home|workspace|editor|feed|app|note/i },
    { goal: "Discovery", pattern: /search|browse|explore|catalog|results/i },
];
/**
 * Normalize an identifier for keyword matching: split camelCase and treat
 * separators as spaces, so `newStudy` / `search-results` expose word
 * boundaries the rules can anchor on.
 */
function normalizeTokens(text) {
    return text
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[-_./:]+/g, " ")
        .toLowerCase();
}
/** Classify a screen into a business goal by keyword, or null if none match. */
function classifyGoal(screen) {
    const name = normalizeTokens(shortName(screen));
    return GOAL_RULES.find((r) => r.pattern.test(name))?.goal ?? null;
}
/** Turn the population's behavioural segments into inferred personas. */
function inferPersonas(study) {
    const bySegment = new Map();
    for (const op of study.operators) {
        const list = bySegment.get(op.segment) ?? [];
        list.push(op);
        bySegment.set(op.segment, list);
    }
    return study.segments.map((seg) => {
        const members = bySegment.get(seg.key) ?? [];
        const completed = members.filter((m) => m.completed).length;
        const personaCounts = new Map();
        for (const m of members)
            personaCounts.set(m.persona, (personaCounts.get(m.persona) ?? 0) + 1);
        const typical = [...personaCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed";
        return {
            archetype: seg.name,
            segmentKey: seg.key,
            share: seg.share,
            size: seg.size,
            successRate: members.length ? round(completed / members.length, 3) : 0,
            typicalPersona: typical,
            description: seg.description,
        };
    });
}
/** Classify visited screens into business goals, ranked by traffic share. */
function inferBusinessGoals(study) {
    const traffic = new Map();
    let total = 0;
    for (const entry of study.navigationHeatmap) {
        const goal = classifyGoal(entry.screen);
        total += entry.visits;
        if (!goal)
            continue;
        const agg = traffic.get(goal) ?? { visits: 0, screens: new Set() };
        agg.visits += entry.visits;
        agg.screens.add(shortName(entry.screen));
        traffic.set(goal, agg);
    }
    return [...traffic.entries()]
        .map(([goal, agg]) => ({
        goal,
        trafficShare: total ? round(agg.visits / total, 3) : 0,
        screens: [...agg.screens],
        evidence: `${agg.visits} visits across ${agg.screens.size} screen(s): ${[...agg.screens].join(", ")}.`,
    }))
        .sort((a, b) => b.trafficShare - a.trafficShare);
}
/** Build a screen→screen transition frequency map from operator paths. */
function transitionCounts(study) {
    const edges = new Map();
    for (const op of study.operators) {
        for (let i = 0; i + 1 < op.path.length; i += 1) {
            const from = op.path[i];
            const to = op.path[i + 1];
            if (from === to)
                continue;
            const outs = edges.get(from) ?? new Map();
            outs.set(to, (outs.get(to) ?? 0) + 1);
            edges.set(from, outs);
        }
    }
    return edges;
}
/** Reconstruct the dominant path by greedily following the busiest transitions. */
function dominantWorkflow(study, edges) {
    const starts = new Map();
    for (const op of study.operators) {
        const first = op.path[0];
        if (first)
            starts.set(first, (starts.get(first) ?? 0) + 1);
    }
    const start = [...starts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!start)
        return null;
    const sequence = [start];
    const seen = new Set([start]);
    let current = start;
    let minTraversal = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 8; step += 1) {
        const outs = edges.get(current);
        if (!outs)
            break;
        const next = [...outs.entries()].filter(([to]) => !seen.has(to)).sort((a, b) => b[1] - a[1])[0];
        if (!next)
            break;
        minTraversal = Math.min(minTraversal, next[1]);
        sequence.push(next[0]);
        seen.add(next[0]);
        current = next[0];
    }
    if (sequence.length < 2)
        return null;
    return {
        label: "Primary path",
        sequence: sequence.map(shortName),
        traversals: Number.isFinite(minTraversal) ? minTraversal : 0,
    };
}
/** The single most-traveled screen→screen transition, as a 2-step workflow. */
function topTransitionWorkflow(edges) {
    let best = null;
    for (const [from, outs] of edges) {
        for (const [to, count] of outs) {
            if (!best || count > best.count)
                best = { from, to, count };
        }
    }
    if (!best)
        return null;
    return {
        label: "Most-traveled transition",
        sequence: [shortName(best.from), shortName(best.to)],
        traversals: best.count,
    };
}
/** Score each screen by reach × engagement, flagging critical-path membership. */
function inferFeatureImportance(study, criticalPath) {
    const maxVisits = Math.max(1, ...study.navigationHeatmap.map((e) => e.visits));
    return study.navigationHeatmap
        .map((e) => ({
        feature: shortName(e.screen),
        reach: e.reach,
        visits: e.visits,
        importance: Math.round(e.reach * 70 + (e.visits / maxVisits) * 30),
        onCriticalPath: criticalPath.has(shortName(e.screen)),
    }))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);
}
/** Rank screens by friction (abandonment + revisiting), with reasons. */
function inferFrictionPages(study) {
    const maxRevisit = Math.max(1, ...study.navigationHeatmap.map((e) => (e.operators ? e.visits / e.operators : 0)));
    return study.navigationHeatmap
        .map((e) => {
        const revisitRatio = e.operators ? e.visits / e.operators : 0;
        const dropShare = study.size ? e.dropoffs / study.size : 0;
        const frictionScore = Math.round(dropShare * 60 + (revisitRatio / maxRevisit) * 40);
        const reasons = [];
        if (e.dropoffs > 0)
            reasons.push(`${e.dropoffs} user(s) abandoned here`);
        if (revisitRatio >= 3)
            reasons.push(`revisited ${round(revisitRatio, 1)}× per user (back-and-forth searching)`);
        return {
            screen: shortName(e.screen),
            frictionScore,
            dropoffs: e.dropoffs,
            revisitRatio: round(revisitRatio, 1),
            reasons,
        };
    })
        .filter((f) => f.reasons.length > 0)
        .sort((a, b) => b.frictionScore - a.frictionScore)
        .slice(0, 6);
}
/** Where abandonment concentrates, with the most likely cause per screen. */
function inferDropoffCauses(study) {
    const byScreen = new Map();
    for (const op of study.operators) {
        if (op.dropoffScreen)
            byScreen.set(op.dropoffScreen, (byScreen.get(op.dropoffScreen) ?? 0) + 1);
    }
    const worstFinding = [...study.topFindings]
        .filter((f) => f.severity === "critical" || f.severity === "major")
        .sort((a, b) => b.prevalence - a.prevalence)[0];
    return [...byScreen.entries()]
        .map(([screen, operators]) => {
        const name = shortName(screen);
        const onScreen = study.topFindings.find((f) => f.evidence && new RegExp(name, "i").test(f.evidence));
        const likelyCause = onScreen
            ? `${onScreen.title} (${Math.round(onScreen.prevalence * 100)}% of users)`
            : worstFinding
                ? `Likely: ${worstFinding.title}`
                : "Users could not find a path forward.";
        return {
            screen: name,
            operators,
            share: study.size ? round(operators / study.size, 3) : 0,
            likelyCause,
        };
    })
        .sort((a, b) => b.operators - a.operators)
        .slice(0, 6);
}
/**
 * Infer product intelligence from a population study.
 */
export function inferProductIntelligence(study) {
    const edges = transitionCounts(study);
    const dominant = dominantWorkflow(study, edges);
    const topTransition = topTransitionWorkflow(edges);
    const criticalPath = new Set(dominant?.sequence ?? []);
    const criticalWorkflows = [];
    if (dominant)
        criticalWorkflows.push(dominant);
    if (topTransition &&
        !(dominant && topTransition.sequence.join(">") === dominant.sequence.slice(0, 2).join(">")))
        criticalWorkflows.push(topTransition);
    return {
        url: study.url,
        label: study.label ?? study.url,
        size: study.size,
        personas: inferPersonas(study),
        businessGoals: inferBusinessGoals(study),
        criticalWorkflows,
        featureImportance: inferFeatureImportance(study, criticalPath),
        highFrictionPages: inferFrictionPages(study),
        dropoffCauses: inferDropoffCauses(study),
        generatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=intelligence.js.map