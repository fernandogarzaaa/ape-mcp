/**
 * The moderator — reconciles the independent specialist reports into one
 * executive study report: where the panel agrees (consensus), where it pulls
 * in different directions (conflicts), the merged priority list, and an overall
 * release verdict with a confidence that reflects both panel agreement and
 * sample size.
 */
import { runSpecialists } from "./specialists.js";
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, info: 3 };
/** Themes used to detect when independent specialists are talking about the same thing. */
const THEMES = [
    {
        key: "abandonment",
        label: "Abandonment & drop-off",
        pattern: /abandon|drop-?off|churn|gave up|quitter/i,
    },
    {
        key: "broken",
        label: "Broken / silent interactions",
        pattern: /no visible response|silent|does nothing|defect|feedback/i,
    },
    {
        key: "accessibility",
        label: "Accessibility & legibility",
        pattern: /contrast|target|accessib|9px|elderly|legib/i,
    },
    {
        key: "navigation",
        label: "Navigation & wayfinding",
        pattern: /navigat|revisit|wayfinding|path|steps|long/i,
    },
    { key: "affect", label: "Frustration & trust", pattern: /frustrat|trust|confidence|distrust/i },
    { key: "success", label: "Task success", pattern: /success|complet|lift/i },
];
function themeOf(observation) {
    return THEMES.find((t) => t.pattern.test(observation.statement) || t.pattern.test(observation.evidence));
}
function buildConsensus(specialists) {
    const byTheme = new Map();
    for (const s of specialists) {
        for (const obs of s.observations) {
            const theme = themeOf(obs);
            if (!theme)
                continue;
            const entry = byTheme.get(theme.key);
            if (entry) {
                entry.roles.add(s.role);
                if (SEVERITY_ORDER[obs.severity] < SEVERITY_ORDER[entry.severity]) {
                    entry.severity = obs.severity;
                    entry.statement = obs.statement;
                }
            }
            else {
                byTheme.set(theme.key, {
                    label: theme.label,
                    roles: new Set([s.role]),
                    severity: obs.severity,
                    statement: obs.statement,
                });
            }
        }
    }
    return [...byTheme.values()]
        .filter((e) => e.roles.size >= 2)
        .map((e) => ({
        theme: e.label,
        statement: e.statement,
        roles: [...e.roles],
        severity: e.severity,
    }))
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.roles.length - a.roles.length);
}
function buildConflicts(specialists) {
    const byStance = new Map();
    for (const s of specialists) {
        const list = byStance.get(s.stance) ?? [];
        list.push(s.role);
        byStance.set(s.stance, list);
    }
    const blockers = byStance.get("block") ?? [];
    const shippers = byStance.get("ship") ?? [];
    if (blockers.length && shippers.length) {
        return [
            {
                topic: "Release readiness",
                positions: [
                    ...blockers.map((role) => ({ role, stance: "block" })),
                    ...shippers.map((role) => ({ role, stance: "ship" })),
                ],
                note: `${blockers.join(", ")} see a release-blocking issue in their area, while ` +
                    `${shippers.join(", ")} see no blockers in theirs — the blocker is domain-specific, not universal.`,
            },
        ];
    }
    return [];
}
function normalizeAction(action) {
    return action.trim().toLowerCase().replace(/\s+/g, " ").replace(/[."']/g, "");
}
function buildPriorities(specialists) {
    const merged = new Map();
    for (const s of specialists) {
        for (const rec of s.recommendations) {
            const key = normalizeAction(rec.action);
            const entry = merged.get(key);
            if (entry) {
                entry.sources.add(s.role);
                entry.score = Math.max(entry.score, rec.priority);
            }
            else {
                merged.set(key, {
                    action: rec.action,
                    score: rec.priority,
                    sources: new Set([s.role]),
                    rationale: rec.rationale,
                });
            }
        }
    }
    return [...merged.values()]
        .map((e) => ({
        action: e.action,
        score: Math.min(100, e.score + 5 * (e.sources.size - 1)),
        sources: [...e.sources],
        rationale: e.rationale,
    }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
}
function decideVerdict(study, specialists) {
    const blocked = specialists.some((s) => s.stance === "block");
    if (study.successRate < 0.5 || blocked)
        return "do-not-ship";
    const caution = specialists.some((s) => s.stance === "caution");
    if (study.dropoffRate > 0.15 || caution)
        return "ship-with-fixes";
    return "ship";
}
const VERDICT_TEXT = {
    ship: "Ship — the experience holds up across the simulated population",
    "ship-with-fixes": "Ship with fixes — usable, but with issues the panel agrees on",
    "do-not-ship": "Do not ship — a release-blocking experience problem is widespread",
};
/**
 * Convene the AI-moderated user study over a population study: every specialist
 * files an independent report, then the moderator synthesizes them.
 */
export function moderateStudy(study) {
    const specialists = runSpecialists(study);
    const consensus = buildConsensus(specialists);
    const conflicts = buildConflicts(specialists);
    const priorities = buildPriorities(specialists);
    const verdict = decideVerdict(study, specialists);
    const meanConfidence = specialists.reduce((sum, s) => sum + s.confidence, 0) / Math.max(1, specialists.length);
    const confidence = Math.round(meanConfidence * (conflicts.length ? 0.9 : 1) * 100) / 100;
    const topConsensus = consensus[0];
    const headline = `${VERDICT_TEXT[verdict]}. ${Math.round(study.successRate * 100)}% task success across ${study.size} users${topConsensus ? `; the panel agrees on: ${topConsensus.theme.toLowerCase()}.` : "."}`;
    return {
        verdict,
        headline,
        confidence,
        successRate: study.successRate,
        dropoffRate: study.dropoffRate,
        consensus,
        conflicts,
        priorities,
        specialists,
        generatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=moderator.js.map