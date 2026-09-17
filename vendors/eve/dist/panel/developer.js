export function generateTickets(plan, executive) {
    const tickets = [];
    for (const epic of plan.epics) {
        for (const story of epic.stories) {
            tickets.push(ticketFromStory(epic, story, executive));
        }
    }
    return tickets;
}
function ticketFromStory(epic, story, executive) {
    const priority = story.severity === "critical" ? "urgent" : story.severity === "major" ? "high" : "medium";
    const estimate = epic.priorityScore >= 0.8 ? "M" : epic.priorityScore >= 0.3 ? "M" : "L";
    const body = [
        `**User story:** As a ${story.asA}, I want ${story.iWant}, so that ${story.soThat}.`,
        "",
        `**Problem (from EVE simulation):** ${epic.problem}`,
        "",
        `**Business impact:** ${epic.businessImpact}`,
        "",
        `**Evidence:** Surfaced by simulated experience validation across ${executive.personaCount} persona(s); mean experience score ${executive.meanOverallScore}/100.`,
        "",
        "**Acceptance criteria:**",
        ...story.acceptanceCriteria.map((c) => `- [ ] ${c}`),
        "",
        `_Epic: ${epic.id} · Priority score: ${epic.priorityScore} · Est. completion lift: +${Math.round(epic.estimatedCompletionLift * 100)}%_`,
    ].join("\n");
    return {
        key: story.id,
        title: story.title,
        body,
        labels: ["ux", "eve-generated", `severity:${story.severity}`],
        priority,
        estimate,
        acceptanceCriteria: story.acceptanceCriteria,
    };
}
/* ------------------------------------------------------------------ */
/* Serializers                                                        */
/* ------------------------------------------------------------------ */
/** GitHub Issues (one Markdown block per ticket, ready for the API `body`). */
export function toGitHubIssues(tickets) {
    return tickets.map((t) => ({
        title: t.title,
        body: `${t.body}\n\n_Priority: ${t.priority} · Estimate: ${t.estimate}_`,
        labels: [...t.labels],
    }));
}
/** Linear issues (title/description/priority as Linear's 0–4 scale). */
export function toLinearIssues(tickets) {
    const priorityMap = { urgent: 1, high: 2, medium: 3, low: 4 };
    return tickets.map((t) => ({
        title: t.title,
        description: t.body,
        priority: priorityMap[t.priority],
        labels: [...t.labels],
    }));
}
/** Jira tickets (summary/description/priority/issuetype). */
export function toJiraIssues(tickets) {
    const priorityMap = { urgent: "Highest", high: "High", medium: "Medium", low: "Low" };
    return tickets.map((t) => ({
        summary: t.title,
        description: t.body,
        priority: priorityMap[t.priority],
        issuetype: "Story",
        labels: t.labels.map((l) => l.replace(/[^a-zA-Z0-9_-]/g, "_")),
    }));
}
/** A single Markdown task document. */
export function toMarkdownTasks(tickets, title = "EVE-generated UX backlog") {
    const lines = [`# ${title}`, ""];
    for (const t of tickets) {
        lines.push(`## ${t.key} — ${t.title}`);
        lines.push(`> Priority: **${t.priority}** · Estimate: **${t.estimate}** · Labels: ${t.labels.join(", ")}`);
        lines.push("");
        lines.push(t.body);
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=developer.js.map