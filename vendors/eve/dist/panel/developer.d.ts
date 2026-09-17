import type { ExecutiveReport } from "./moderator.js";
import type { ProductPlan } from "./productManager.js";
/**
 * Developer AI.
 *
 * Translates the product plan into concrete, trackable engineering work
 * items in the format of common trackers: GitHub Issues, Linear issues, Jira
 * tickets, and plain Markdown task lists. Output is data + serializers, so it
 * can be piped straight into an API client or written to disk — no network
 * calls are made here (integration is the caller's choice).
 */
export interface DevTicket {
    readonly key: string;
    readonly title: string;
    readonly body: string;
    readonly labels: readonly string[];
    readonly priority: "urgent" | "high" | "medium" | "low";
    readonly estimate: "S" | "M" | "L";
    readonly acceptanceCriteria: readonly string[];
}
export declare function generateTickets(plan: ProductPlan, executive: ExecutiveReport): DevTicket[];
/** GitHub Issues (one Markdown block per ticket, ready for the API `body`). */
export declare function toGitHubIssues(tickets: readonly DevTicket[]): Array<{
    title: string;
    body: string;
    labels: string[];
}>;
/** Linear issues (title/description/priority as Linear's 0–4 scale). */
export declare function toLinearIssues(tickets: readonly DevTicket[]): Array<{
    title: string;
    description: string;
    priority: number;
    labels: string[];
}>;
/** Jira tickets (summary/description/priority/issuetype). */
export declare function toJiraIssues(tickets: readonly DevTicket[]): Array<{
    summary: string;
    description: string;
    priority: string;
    issuetype: string;
    labels: string[];
}>;
/** A single Markdown task document. */
export declare function toMarkdownTasks(tickets: readonly DevTicket[], title?: string): string;
//# sourceMappingURL=developer.d.ts.map