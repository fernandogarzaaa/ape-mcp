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
    if (subject && typeof subject === "object")
        validateSubjectSpec(subject, `${sourceName}: spec.subject`);
    if (s.baseline !== undefined) {
        if (!s.baseline || typeof s.baseline !== "object")
            throw new SpecError(`${sourceName}: spec.baseline must be an object`);
        validateSubjectSpec(s.baseline, `${sourceName}: spec.baseline`);
    }
    if (s.ablations !== undefined) {
        if (!Array.isArray(s.ablations))
            throw new SpecError(`${sourceName}: spec.ablations must be an array`);
        for (const [i, abl] of s.ablations.entries()) {
            if (!abl || typeof abl !== "object")
                throw new SpecError(`${sourceName}: spec.ablations[${i}] must be an object`);
            const a = abl;
            if (typeof a.name !== "string" || !a.name)
                throw new SpecError(`${sourceName}: spec.ablations[${i}].name must be a nonempty string`);
            if (!a.subject || typeof a.subject !== "object")
                throw new SpecError(`${sourceName}: spec.ablations[${i}].subject is required`);
            validateSubjectSpec(a.subject, `${sourceName}: spec.ablations[${i}].subject`);
        }
    }
    validateDatasetSpec(dataset, sourceName);
    const evaluator = s.evaluator;
    if (!evaluator || typeof evaluator !== "object")
        throw new SpecError(`${sourceName}: spec.evaluator is required`);
    validateEvaluatorSpec(evaluator, `${sourceName}: spec.evaluator`);
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
    if (s.seeds !== undefined) {
        if (!Array.isArray(s.seeds) || s.seeds.length === 0) {
            throw new SpecError(`${sourceName}: seeds must be a nonempty array`);
        }
        for (const seed of s.seeds) {
            if (typeof seed !== "number" && typeof seed !== "string") {
                throw new SpecError(`${sourceName}: seeds must contain only numbers/strings`);
            }
        }
    }
    if (s.timeout_ms !== undefined && (typeof s.timeout_ms !== "number" || !Number.isFinite(s.timeout_ms) || s.timeout_ms < 0)) {
        throw new SpecError(`${sourceName}: timeout_ms must be a finite number >= 0`);
    }
    if (s.metrics !== undefined) {
        if (!Array.isArray(s.metrics))
            throw new SpecError(`${sourceName}: metrics must be an array of strings`);
        for (const m of s.metrics) {
            if (typeof m !== "string" || !m)
                throw new SpecError(`${sourceName}: metrics must be nonempty strings`);
        }
    }
    if (s.thresholds !== undefined) {
        if (!s.thresholds || typeof s.thresholds !== "object" || Array.isArray(s.thresholds)) {
            throw new SpecError(`${sourceName}: thresholds must be an object`);
        }
        for (const [k, v] of Object.entries(s.thresholds)) {
            if (typeof v !== "string" || !/^(>=|<=|>|<|==|!=)\s*-?\d+(\.\d+)?$/.test(v.trim())) {
                throw new SpecError(`${sourceName}: thresholds["${k}"] must look like ">= 0.8"`);
            }
        }
    }
    if (s.sanity_threshold !== undefined && (typeof s.sanity_threshold !== "number" || !Number.isFinite(s.sanity_threshold))) {
        throw new SpecError(`${sourceName}: sanity_threshold must be a finite number`);
    }
    const maxTurns = s.max_turns;
    if (maxTurns !== undefined && (!Number.isInteger(maxTurns) || maxTurns < 1)) {
        throw new SpecError(`${sourceName}: max_turns must be an integer >= 1`);
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
        ...(maxTurns !== undefined ? { max_turns: maxTurns } : {}),
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
const EVALUATOR_TYPES = new Set([
    "exact", "regex", "json_schema", "javascript", "command", "llm_command",
    "human", "oracle", "composite", "pass_through", "classification",
    "retrieval", "trajectory", "refusal",
]);
const DATASET_FORMATS = new Set(["json", "jsonl", "csv", "yaml", "text", "dir", "auto"]);
function validateSubjectSpec(s, where) {
    const transports = ["command", "http", "inline"].filter((k) => s[k] !== undefined);
    if (transports.length === 0)
        throw new SpecError(`${where}: one of command, http, or inline is required`);
    if (transports.length > 1)
        throw new SpecError(`${where}: exactly one subject transport is required (got ${transports.join(", ")})`);
    if (s.command !== undefined && typeof s.command !== "string")
        throw new SpecError(`${where}.command must be a string`);
    if (s.inline !== undefined && typeof s.inline !== "string")
        throw new SpecError(`${where}.inline must be a string`);
    if (s.http !== undefined) {
        if (!s.http || typeof s.http !== "object")
            throw new SpecError(`${where}.http must be an object`);
        const h = s.http;
        if (typeof h.url !== "string" || !h.url)
            throw new SpecError(`${where}.http.url must be a nonempty string`);
    }
    if (s.timeout_ms !== undefined && (typeof s.timeout_ms !== "number" || !Number.isFinite(s.timeout_ms) || s.timeout_ms < 0)) {
        throw new SpecError(`${where}.timeout_ms must be a finite number >= 0`);
    }
}
function validateDatasetSpec(d, sourceName) {
    const sources = ["path", "inline", "stdin"].filter((k) => d[k] !== undefined && d[k] !== false);
    if (sources.length === 0)
        throw new SpecError(`${sourceName}: dataset needs one of path, inline, or stdin:true`);
    if (sources.length > 1)
        throw new SpecError(`${sourceName}: dataset sources are exclusive (got ${sources.join(", ")})`);
    if (d.format !== undefined && (typeof d.format !== "string" || !DATASET_FORMATS.has(d.format))) {
        throw new SpecError(`${sourceName}: dataset.format must be one of ${[...DATASET_FORMATS].join(", ")}`);
    }
}
function validateEvaluatorSpec(e, where) {
    if (typeof e.type !== "string")
        throw new SpecError(`${where}.type is required`);
    if (!EVALUATOR_TYPES.has(e.type))
        throw new SpecError(`${where}.type must be one of ${[...EVALUATOR_TYPES].join(", ")}`);
    const need = (field) => {
        if (e[field] === undefined)
            throw new SpecError(`${where}: evaluator ${e.type} requires "${field}"`);
    };
    switch (e.type) {
        case "regex":
            need("pattern");
            break;
        case "json_schema":
            need("schema");
            break;
        case "javascript":
            need("script");
            break;
        case "command":
        case "oracle":
        case "llm_command":
            need("command");
            break;
        case "human":
            need("judgments");
            break;
        case "composite": {
            if (!Array.isArray(e.evaluators) || e.evaluators.length === 0) {
                throw new SpecError(`${where}: evaluator composite requires nonempty evaluators[]`);
            }
            for (const [i, sub] of e.evaluators.entries()) {
                if (!sub || typeof sub !== "object")
                    throw new SpecError(`${where}.evaluators[${i}] must be an object`);
                validateEvaluatorSpec(sub, `${where}.evaluators[${i}]`);
            }
            if (e.mode !== undefined && e.mode !== "all" && e.mode !== "any") {
                throw new SpecError(`${where}.mode must be "all" or "any"`);
            }
            break;
        }
        case "trajectory":
            break;
        default:
            break;
    }
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
                // Pop to the enclosing list first: sibling map items (e.g. a second
                // `- type: ...` under `evaluators:`) otherwise strand the stack on
                // the previous item's map and fail with "list item without parent".
                while (stack.length > 1 && indent <= (stack[stack.length - 1]?.indent ?? -1))
                    stack.pop();
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