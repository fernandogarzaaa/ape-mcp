/**
 * Claim-first evaluation: parse, validate, and compile claims.
 *
 * A claim is what someone wants to establish empirically. It compiles to an
 * evaluation plan; it never executes anything itself. Invalid claims are
 * INVALID (a verdict about the claim), never silently coerced.
 */
export class ClaimError extends Error {
    name = "ClaimError";
}
const OPERATORS = new Set([">=", "<=", ">", "<", "==", "!="]);
export function validateClaim(raw) {
    const problems = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { claim: { id: "invalid", statement: "", status: "INVALID" }, problems: ["claim must be an object"] };
    }
    const c = raw;
    const id = typeof c.id === "string" && c.id.length > 0 ? c.id : null;
    if (!id)
        problems.push('claim.id is required (string)');
    const statement = typeof c.statement === "string" ? c.statement : "";
    if (!statement)
        problems.push("claim.statement is required (string)");
    const hypothesis = c.hypothesis;
    if (hypothesis !== undefined) {
        const primary = hypothesis.primary;
        if (!primary)
            problems.push("claim.hypothesis.primary is required when hypothesis is present");
        else
            validateHypothesis(primary, "primary", problems);
        const secondary = hypothesis.secondary;
        if (secondary !== undefined) {
            const list = Array.isArray(secondary) ? secondary : [secondary];
            for (const [i, h] of list.entries())
                validateHypothesis(h, `secondary[${i}]`, problems);
        }
    }
    const methodology = c.methodology;
    if (methodology !== undefined) {
        const reps = methodology.repetitions;
        if (reps !== undefined && (!Number.isInteger(reps) || reps < 1)) {
            problems.push("claim.methodology.repetitions must be an integer >= 1");
        }
        const min = methodology.minimum_samples;
        if (min !== undefined && (!Number.isInteger(min) || min < 1)) {
            problems.push("claim.methodology.minimum_samples must be an integer >= 1");
        }
    }
    const claim = {
        id: id ?? "invalid",
        statement,
        status: "UNTESTED",
        ...(hypothesis?.primary ? { hypothesis: normalizeHypothesis(c) } : {}),
        ...(c.population ? { population: c.population } : {}),
        ...(c.baseline ? { baseline: c.baseline } : {}),
        ...(c.treatment ? { treatment: c.treatment } : {}),
        ...(methodology ? { methodology: methodology } : {}),
        ...(c.evaluation ? { evaluation: c.evaluation } : {}),
        ...(c.conclusion_policy ? { conclusion_policy: c.conclusion_policy } : {}),
    };
    return { claim, problems };
}
function validateHypothesis(h, where, problems) {
    if (!h || typeof h !== "object") {
        problems.push(`claim.hypothesis.${where} must be an object`);
        return;
    }
    const hh = h;
    if (typeof hh.metric !== "string" || !hh.metric)
        problems.push(`claim.hypothesis.${where}.metric is required`);
    if (!OPERATORS.has(hh.operator))
        problems.push(`claim.hypothesis.${where}.operator must be one of >=, <=, >, <, ==, !=`);
    if (typeof hh.threshold !== "number" || !Number.isFinite(hh.threshold)) {
        problems.push(`claim.hypothesis.${where}.threshold must be a finite number`);
    }
}
function normalizeHypothesis(c) {
    const h = c.hypothesis;
    const primary = h.primary;
    const secondary = h.secondary;
    const list = secondary === undefined ? [] : Array.isArray(secondary) ? secondary : [secondary];
    return {
        primary: primary,
        ...(list.length > 0 ? { secondary: list } : {}),
    };
}
/** Evaluate one hypothesis against an observed value. Null observed → null (INCONCLUSIVE). */
export function checkHypothesis(h, observed) {
    if (observed === null || !Number.isFinite(observed))
        return null;
    switch (h.operator) {
        case ">=": return observed >= h.threshold;
        case "<=": return observed <= h.threshold;
        case ">": return observed > h.threshold;
        case "<": return observed < h.threshold;
        case "==": return observed === h.threshold;
        case "!=": return observed !== h.threshold;
    }
}
//# sourceMappingURL=claim.js.map