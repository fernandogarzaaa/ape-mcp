/**
 * Human-readable rendering of a digital twin's evolving profile.
 */
/** Render a twin's profile and evolution as Markdown. */
export function renderTwinMarkdown(twin) {
    const e = twin.evolution;
    const lines = [
        `# Digital twin — ${twin.name}`,
        "",
        `Base persona: \`${twin.basePersona}\`${twin.profession ? ` · profession: \`${twin.profession}\`` : ""}${twin.culture ? ` · culture: \`${twin.culture}\`` : ""}`,
        "",
        "## Evolution",
        `- **Sessions:** ${e.sessions}`,
        `- **Expertise:** ${Math.round(e.expertise * 100)}%`,
        `- **Confidence baseline:** ${e.confidenceBaseline}`,
        `- **Mean experience score:** ${e.meanScore}`,
        `- **Score history:** ${e.scoreHistory.join(" → ") || "—"}`,
        `- **Trust history:** ${e.trustHistory.join(" → ") || "—"}`,
        `- **Apps experienced:** ${e.appsExperienced.length} (${e.appsExperienced.join(", ") || "none"})`,
        `- **Apps in memory:** ${Object.keys(twin.memories).length}`,
        "",
    ];
    return lines.join("\n");
}
//# sourceMappingURL=report.js.map