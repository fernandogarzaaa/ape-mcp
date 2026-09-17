export { critiqueDesign } from "./designCritic.js";
export { generateTickets, toGitHubIssues, toJiraIssues, toLinearIssues, toMarkdownTasks, } from "./developer.js";
export { moderatePanel } from "./moderator.js";
export { buildProductPlan } from "./productManager.js";
import { forecastExperience } from "../forecasting/forecast.js";
import { critiqueDesign } from "./designCritic.js";
import { generateTickets } from "./developer.js";
import { moderatePanel } from "./moderator.js";
import { buildProductPlan } from "./productManager.js";
/**
 * Run the full AI panel over a set of sessions: independent design critique,
 * experience forecast, moderator consensus, product plan, and developer
 * tickets. This is the end-to-end "team of AIs" pass.
 */
export function runPanel(sessions) {
    if (sessions.length === 0)
        throw new Error("runPanel requires at least one session");
    const screens = sessions.flatMap((s) => s.capturedScreens);
    const allFindings = sessions.flatMap((s) => [...s.findings]);
    const critique = critiqueDesign(screens, allFindings);
    const forecast = forecastExperience(sessions);
    const executive = moderatePanel({ sessions, critique, forecast });
    const plan = buildProductPlan({ executive, forecast, critique });
    const tickets = generateTickets(plan, executive);
    return { executive, critique, forecast, plan, tickets };
}
//# sourceMappingURL=index.js.map