import { EveSession } from "../engine/session.js";
import { InMemoryStore } from "../memory/longTerm.js";
/**
 * Run a collaborative scenario end-to-end.
 */
export async function runCollaborative(scenario) {
    if (scenario.roles.length === 0)
        throw new Error("A collaborative scenario needs at least one role");
    const sharedMemory = (scenario.sharedMemory ?? true) ? new InMemoryStore() : undefined;
    const roleResults = [];
    const handoffs = [];
    let breakdown = null;
    let lastEndUrl = scenario.startUrl;
    let lastRole = null;
    let lastResult = null;
    for (let i = 0; i < scenario.roles.length; i++) {
        const role = scenario.roles[i];
        const startUrl = role.startUrl ?? lastEndUrl;
        // Record the handoff from the previous role.
        if (lastRole && lastResult) {
            handoffs.push({
                from: lastRole.name,
                to: role.name,
                upstreamCompleted: lastResult.goalAchieved,
                atUrl: lastEndUrl,
                note: lastResult.goalAchieved
                    ? `${lastRole.name} completed "${lastRole.goal}" and handed off to ${role.name}.`
                    : `${lastRole.name} did NOT complete "${lastRole.goal}" before handing off — ${role.name} may be blocked.`,
            });
            if (!lastResult.goalAchieved && !breakdown) {
                breakdown = {
                    role: lastRole.name,
                    reason: `${lastRole.name} could not complete their step (${lastResult.endReason}), stalling the chain.`,
                };
            }
        }
        const session = new EveSession({
            adapter: scenario.adapterFactory(),
            startUrl,
            persona: role.persona,
            goal: role.goal,
            goalSuccessSignals: role.goalSuccessSignals,
            seed: scenario.seed !== undefined ? `${String(scenario.seed)}:${role.name}` : undefined,
            maxSteps: role.maxSteps ?? 40,
            paceScale: 0,
            cognitive: scenario.cognitive ?? false,
            longTermMemory: sharedMemory,
            plugins: role.plugins,
        });
        const result = await session.run();
        roleResults.push({ role: role.name, result });
        // The next role begins where this one ended (its last visited URL).
        lastEndUrl = result.iterations[result.iterations.length - 1]?.url ?? startUrl;
        lastRole = role;
        lastResult = result;
    }
    const chainCompleted = roleResults.every((r) => r.result.goalAchieved);
    const summary = buildSummary(scenario.name, roleResults, handoffs, chainCompleted, breakdown);
    return {
        scenario: scenario.name,
        roleResults,
        handoffs,
        chainCompleted,
        breakdown,
        summary,
    };
}
function buildSummary(name, roleResults, handoffs, chainCompleted, breakdown) {
    const roles = roleResults.map((r) => r.role).join(" → ");
    if (chainCompleted) {
        return `Collaborative scenario "${name}" completed end-to-end across ${roleResults.length} role(s): ${roles}. All ${handoffs.length} handoff(s) succeeded.`;
    }
    const failedHandoffs = handoffs.filter((h) => !h.upstreamCompleted).length;
    return (`Collaborative scenario "${name}" broke down${breakdown ? ` at "${breakdown.role}": ${breakdown.reason}` : ""}. ` +
        `${failedHandoffs} of ${handoffs.length} handoff(s) passed incomplete work downstream — a shared-workflow failure functional tests would miss.`);
}
//# sourceMappingURL=collaborative.js.map