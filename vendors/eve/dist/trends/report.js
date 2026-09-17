/**
 * Human-readable rendering of a continuous-UX-regression trend report.
 */
const ARROW = {
    improved: "▲ improved",
    regressed: "▼ regressed",
    stable: "▪ stable",
};
/** Render a trend report as Markdown. */
export function renderTrendReportMarkdown(report) {
    const lines = [
        "# Continuous UX regression — trend report",
        "",
        `Builds (oldest → newest): ${report.builds.join(" → ")}`,
        "",
        `**Verdict: ${report.verdict.toUpperCase()}** — ${report.summary}`,
        "",
        "## Metric trends",
        "",
        "| Metric | Series | Δ | Direction |",
        "|---|---|---|---|",
    ];
    for (const t of report.trends) {
        lines.push(`| ${t.label} | ${t.series.join(" → ")} | ${t.delta >= 0 ? "+" : ""}${t.delta} | ${ARROW[t.direction]} |`);
    }
    if (report.regressions.length) {
        lines.push("", "## ⚠️ Regressions");
        for (const t of report.regressions) {
            lines.push(`- **${t.label}** moved from ${t.first} to ${t.last} (Δ ${t.delta >= 0 ? "+" : ""}${t.delta}).`);
        }
    }
    if (report.improvements.length) {
        lines.push("", "## ✅ Improvements");
        for (const t of report.improvements) {
            lines.push(`- **${t.label}**: ${t.first} → ${t.last} (Δ ${t.delta >= 0 ? "+" : ""}${t.delta}).`);
        }
    }
    lines.push("");
    return lines.join("\n");
}
//# sourceMappingURL=report.js.map