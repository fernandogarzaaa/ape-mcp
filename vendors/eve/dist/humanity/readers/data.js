/**
 * Structured-data readers — JSON, YAML and delimited tables.
 *
 * These are the artifacts nobody designed for a human and every human ends
 * up reading anyway: the API response in a bug report, the config someone
 * has to change, the CSV export that *is* the analytics review. They fail
 * comprehension in their own characteristic ways — nesting deeper than
 * working memory holds, keys abbreviated past recognition, a column of
 * numbers with no units — and those failures only become visible once the
 * payload is modeled as something read in an order.
 */
import { parse as parseYaml } from "yaml";
import { ArtifactBuilder } from "./builder.js";
import { tableSummary } from "./markdown.js";
/** Beyond this depth a reader has lost track of which object they are in. */
const MAX_WALK_DEPTH = 12;
/** Rows past this are perceived as "and more" rather than read individually. */
const MAX_ROWS_READ = 200;
export function detectJson(input) {
    if (input.extension === ".json")
        return 0.95;
    const head = input.text.trim();
    if (!head.startsWith("{") && !head.startsWith("["))
        return 0;
    try {
        JSON.parse(head);
        return 0.9;
    }
    catch {
        return 0;
    }
}
export function detectYaml(input) {
    if (input.extension === ".yaml" || input.extension === ".yml")
        return 0.95;
    return 0;
}
export function detectDelimited(input) {
    if (input.extension === ".csv" || input.extension === ".tsv")
        return 0.95;
    const lines = input.text
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .slice(0, 10);
    if (lines.length < 2)
        return 0;
    for (const delimiter of [",", "\t", ";"]) {
        const counts = lines.map((l) => l.split(delimiter).length);
        const first = counts[0] ?? 0;
        if (first >= 2 && counts.every((c) => c === first))
            return 0.7;
    }
    return 0;
}
export function readJson(input) {
    return readTree(input, "json", () => JSON.parse(input.text));
}
export function readYaml(input) {
    return readTree(input, "yaml", () => parseYaml(input.text));
}
function readTree(input, format, parse) {
    const builder = new ArtifactBuilder(input.address, format, input.genre ?? "data");
    let value;
    try {
        value = parse();
    }
    catch (error) {
        // A payload that will not parse is exactly what the reader sees: an
        // error where the content should be. That is content, not a crash.
        builder.startSection("Unreadable payload");
        builder.add({
            kind: "error",
            text: `This ${format.toUpperCase()} could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
        });
        return builder.build();
    }
    // A top-level array of uniform records is a table, and reads like one.
    const table = asTable(value);
    if (table) {
        builder.startSection(builder.currentTitle);
        builder.add({ kind: "table", text: tableSummary(table), table });
        return builder.build();
    }
    builder.startSection("Payload");
    walk(builder, value, "", 0);
    return builder.build();
}
function walk(builder, value, path, depth) {
    if (depth > MAX_WALK_DEPTH) {
        builder.add({
            kind: "output",
            text: `${path}: … (nested deeper than a reader can follow)`,
            depth,
        });
        return;
    }
    if (Array.isArray(value)) {
        const table = asTable(value);
        if (table) {
            builder.add({
                kind: "table",
                text: `${path || "(root)"} — ${tableSummary(table)}`,
                depth,
                table,
            });
            return;
        }
        value.slice(0, MAX_ROWS_READ).forEach((item, index) => {
            walk(builder, item, `${path}[${index}]`, depth + 1);
        });
        if (value.length > MAX_ROWS_READ) {
            builder.add({
                kind: "output",
                text: `${path}: ${value.length - MAX_ROWS_READ} more items`,
                depth,
            });
        }
        return;
    }
    if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
            const childPath = path ? `${path}.${key}` : key;
            if (child !== null && typeof child === "object") {
                builder.add({ kind: "heading", text: childPath, depth: Math.min(depth + 1, 6) });
                walk(builder, child, childPath, depth + 1);
            }
            else {
                builder.add({ kind: "field", text: `${key}: ${formatScalar(child)}`, depth });
            }
        }
        return;
    }
    builder.add({ kind: "field", text: `${path || "value"}: ${formatScalar(value)}`, depth });
}
function formatScalar(value) {
    if (value === null)
        return "null";
    if (typeof value === "string")
        return value;
    return String(value);
}
/** An array of flat objects sharing keys is a table a reader can scan. */
function asTable(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const records = value.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item));
    if (records.length !== value.length)
        return null;
    const columns = Object.keys(records[0] ?? {});
    if (columns.length === 0)
        return null;
    const uniform = records.every((record) => Object.keys(record).length === columns.length &&
        columns.every((column) => column in record) &&
        columns.every((column) => {
            const cell = record[column];
            return cell === null || typeof cell !== "object";
        }));
    if (!uniform)
        return null;
    return {
        columns,
        rows: records
            .slice(0, MAX_ROWS_READ)
            .map((record) => columns.map((column) => formatScalar(record[column]))),
    };
}
export function readDelimited(input) {
    const delimiter = pickDelimiter(input);
    const genre = input.genre ?? "analytics";
    const builder = new ArtifactBuilder(input.address, "csv", genre);
    const rows = input.text
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => splitDelimited(line, delimiter));
    if (rows.length === 0) {
        builder.startSection("Empty file");
        return builder.build();
    }
    const columns = rows[0] ?? [];
    const body = rows.slice(1, MAX_ROWS_READ + 1);
    builder.startSection(builder.currentTitle);
    const detail = { columns, rows: body };
    builder.add({ kind: "table", text: tableSummary(detail), table: detail });
    builder.setMeta("rows", String(rows.length - 1));
    builder.setMeta("columns", String(columns.length));
    if (rows.length - 1 > MAX_ROWS_READ) {
        builder.add({
            kind: "output",
            text: `${rows.length - 1 - MAX_ROWS_READ} further rows below the fold`,
        });
    }
    return builder.build();
}
function pickDelimiter(input) {
    if (input.extension === ".tsv")
        return "\t";
    const first = input.text.split(/\r?\n/).find((line) => line.trim()) ?? "";
    const counts = [",", "\t", ";"].map((d) => ({ d, n: first.split(d).length }));
    counts.sort((a, b) => b.n - a.n);
    return counts[0]?.n && counts[0].n > 1 ? counts[0].d : ",";
}
/** Split one row, honoring the quoting rule every spreadsheet export uses. */
function splitDelimited(line, delimiter) {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quoted) {
            if (char === '"') {
                if (line[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else
                    quoted = false;
            }
            else
                cell += char;
            continue;
        }
        if (char === '"')
            quoted = true;
        else if (char === delimiter) {
            cells.push(cell.trim());
            cell = "";
        }
        else
            cell += char;
    }
    cells.push(cell.trim());
    return cells;
}
//# sourceMappingURL=data.js.map