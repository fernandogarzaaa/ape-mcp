/**
 * Declarative evaluation specification.
 *
 * Users write YAML/JSON; Genesis executes. Supports claim-first (claim file +
 * evaluation file) and standalone evaluation files. Never executes on load.
 */
import { readFileSync } from "node:fs";
import { validateClaim } from "./claim.js";
export class SpecError extends Error {
    name = "SpecError";
}
export function loadSpecFile(path) {
    const raw = readFileSync(path, "utf8");
    return parseSpec(raw, path);
}
export function parseSpec(raw, sourceName = "<inline>") {
    const trimmed = raw.trim();
    let data;
    if (trimmed.startsWith("{")) {
        try {
            data = JSON.parse(trimmed);
        }
        catch (error) {
            throw new SpecError(`${sourceName}: invalid JSON: ${error.message}`);
        }
    }
    else {
        data = parseYamlSubset(trimmed, sourceName);
    }
    return validateSpec(data, sourceName);
}
export function validateSpec(raw, sourceName = "<inline>") {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new SpecError(`${sourceName}: spec must be an object`);
    const s = raw;
    const name = typeof s.name === "string" && s.name ? s.name : "evaluation";
    const dataset = (s.dataset ?? {});
    const subject = s.subject;
    const isBenchmark = s.benchmark !== undefined && typeof s.benchmark === "object";
    if ((!subject || typeof subject !== "object") && !isBenchmark) {
        throw new SpecError(`${sourceName}: spec.subject is required (benchmarks declare it via --subject at run time)`);
    }
    const evaluator = s.evaluator;
    if (!evaluator || typeof evaluator !== "object")
        throw new SpecError(`${sourceName}: spec.evaluator is required`);
    if (typeof evaluator.type !== "string") {
        throw new SpecError(`${sourceName}: spec.evaluator.type is required`);
    }
    let claim;
    const claimRaw = s.claim;
    if (claimRaw !== undefined) {
        const { claim: c, problems } = validateClaim(claimRaw);
        if (problems.length > 0)
            throw new SpecError(`${sourceName}: invalid claim: ${problems.join("; ")}`);
        claim = c;
    }
    const repetitions = s.repetitions;
    if (repetitions !== undefined && (!Number.isInteger(repetitions) || repetitions < 1)) {
        throw new SpecError(`${sourceName}: repetitions must be an integer >= 1`);
    }
    return {
        name,
        ...(claim ? { claim } : {}),
        ...(typeof s.claim_ref === "string" ? { claim_ref: s.claim_ref } : {}),
        ...(isBenchmark ? { benchmark: s.benchmark } : {}),
        dataset: {
            ...(typeof dataset.path === "string" ? { path: dataset.path } : {}),
            ...(Array.isArray(dataset.inline) ? { inline: dataset.inline } : {}),
            ...(dataset.stdin === true ? { stdin: true } : {}),
            ...(typeof dataset.format === "string" ? { format: dataset.format } : {}),
            ...(typeof dataset.id === "string" ? { id: dataset.id } : {}),
            ...(typeof dataset.version === "string" ? { version: dataset.version } : {}),
        },
        subject: subject,
        ...(s.baseline ? { baseline: s.baseline } : {}),
        ...(Array.isArray(s.ablations) ? { ablations: s.ablations } : {}),
        evaluator: evaluator,
        ...(Array.isArray(s.metrics) ? { metrics: s.metrics } : {}),
        ...(repetitions !== undefined ? { repetitions: repetitions } : {}),
        ...(Array.isArray(s.seeds) ? { seeds: s.seeds } : {}),
        ...(typeof s.paired === "boolean" ? { paired: s.paired } : {}),
        ...(typeof s.timeout_ms === "number" ? { timeout_ms: s.timeout_ms } : {}),
        ...(s.thresholds ? { thresholds: s.thresholds } : {}),
        ...(s.regression ? { regression: s.regression } : {}),
        ...(s.gate ? { gate: s.gate } : {}),
        ...(s.sanity_baseline === true ? { sanity_baseline: true } : {}),
        ...(typeof s.sanity_threshold === "number" ? { sanity_threshold: s.sanity_threshold } : {}),
        ...(Array.isArray(s.analysis) ? { analysis: s.analysis } : {}),
        ...(s.output ? { output: s.output } : {}),
    };
}
/**
 * Minimal YAML-subset parser: top-level `key: value` + nested maps/lists by
 * indentation, scalars (string/number/boolean), `|`/`>` blocks. Sufficient for
 * Genesis evaluation specs without adding a dependency.
 */
function parseYamlSubset(text, sourceName) {
    const lines = text.split(/\r?\n/);
    // Fast path: flat mapping only.
    try {
        const root = {};
        const stack = [
            { indent: -1, container: root },
        ];
        let i = 0;
        let blockKey = null;
        while (i < lines.length) {
            const line = lines[i];
            const next = nextLine(lines, i);
            i++;
            if (/^\s*(#|$)/.test(line))
                continue;
            const indent = line.match(/^ */)?.[0].length ?? 0;
            const content = line.slice(indent);
            if (blockKey && (content === "" || indent > blockKey.indent)) {
                const t = blockKey.target[blockKey.key];
                blockKey.target[blockKey.key] = `${t ?? ""}${content}\n`;
                continue;
            }
            else
                blockKey = null;
            if (content.startsWith("- ")) {
                const parent = stack[stack.length - 1];
                if (!parent)
                    throw new Error("bad list");
                const arr = ensureList(stack);
                const itemText = content.slice(2).trim();
                if (itemText === "") {
                    const child = {};
                    arr.push(child);
                    stack.push({ indent, container: child });
                }
                else if (itemText.includes(":") && !itemText.startsWith('"') && !itemText.startsWith("'")) {
                    const child = {};
                    arr.push(child);
                    stack.push({ indent, container: child });
                    parseInlineMap(itemText, child);
                }
                else {
                    arr.push(parseScalar(itemText));
                }
                continue;
            }
            const m = content.match(/^([^:#\s][^:]*):\s*(.*)$/);
            if (!m)
                throw new Error(`unparseable line: ${line}`);
            const key = m[1].trim();
            let value = m[2].trim();
            // Pop stack to correct parent.
            while (stack.length > 1 && indent <= (stack[stack.length - 1]?.indent ?? -1))
                stack.pop();
            const parent = stack[stack.length - 1]?.container;
            // Strip trailing comments for scalars.
            value = stripComment(value);
            if (value === "|" || value === ">") {
                parent[key] = "";
                blockKey = { target: parent, key, indent, style: value };
            }
            else if (value === "") {
                // Nested block: peek — list or map.
                if (next && next.indent > indent && next.content.startsWith("- ")) {
                    const arr = [];
                    parent[key] = arr;
                    stack.push({ indent, container: arr });
                }
                else {
                    const child = {};
                    parent[key] = child;
                    stack.push({ indent, container: child });
                }
            }
            else {
                parent[key] = parseScalar(value);
            }
        }
        return root;
    }
    catch (error) {
        throw new SpecError(`${sourceName}: could not parse YAML-subset: ${error.message}`);
    }
}
function nextLine(lines, i) {
    for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (/^\s*(#|$)/.test(l))
            continue;
        const indent = l.match(/^ */)?.[0].length ?? 0;
        return { indent, content: l.slice(indent) };
    }
    return null;
}
function ensureList(stack) {
    const top = stack[stack.length - 1];
    if (!top)
        throw new Error("bad stack");
    if (Array.isArray(top.container))
        return top.container;
    throw new Error("list item without list parent");
}
function parseInlineMap(itemText, child) {
    const m = itemText.match(/^([^:]+):\s*(.*)$/);
    if (m) {
        child[m[1].trim()] = parseScalar(stripComment(m[2].trim()));
    }
}
function stripComment(v) {
    if (v.startsWith('"') || v.startsWith("'"))
        return v;
    const idx = v.indexOf(" #");
    return idx >= 0 ? v.slice(0, idx).trim() : v;
}
function parseScalar(v) {
    if (v === "" || v === "~" || v === "null")
        return null;
    if (v === "true")
        return true;
    if (v === "false")
        return false;
    if (/^-?\d+$/.test(v))
        return Number(v);
    if (/^-?\d*\.\d+$/.test(v))
        return Number(v);
    const sq = v.match(/^'(.*)'$/s);
    if (sq)
        return sq[1];
    const dq = v.match(/^"(.*)"$/s);
    if (dq) {
        try {
            return JSON.parse(v);
        }
        catch {
            return dq[1];
        }
    }
    if ((v.startsWith("[") && v.endsWith("]")) || (v.startsWith("{") && v.endsWith("}"))) {
        try {
            return JSON.parse(v);
        }
        catch {
            return v;
        }
    }
    return v;
}
//# sourceMappingURL=spec.js.map