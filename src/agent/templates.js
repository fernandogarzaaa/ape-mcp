// Agent templates — curated starter profiles users install into their own
// profiles dir during onboarding (or later via the TUI management screen).
// Bundled templates are read-only; `installTemplate` copies into the user dir
// with collision-safe names. Validation is explicit: every template must pass
// `validateTemplate` or onboarding refuses to offer it.
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function bundledDir() {
  return join(root, "profiles", "templates");
}
function userDir() {
  const d = process.env.APE_DATA_DIR || join(process.cwd(), ".ape");
  return join(d, "profiles");
}

/// Front metadata from `# key: value` header comments. Never throws.
export function templateMeta(text) {
  const meta = {};
  for (const line of String(text ?? "").split("\n")) {
    const m = /^#\s*(template|pitch|budget|needs|forked)\s*:\s*(.+?)\s*$/.exec(line);
    if (m) meta[m[1]] = m[2];
  }
  return meta;
}

export function listTemplates() {
  const dir = bundledDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      const id = basename(f, ".yaml");
      let meta = {};
      try {
        meta = templateMeta(readFileSync(join(dir, f), "utf8"));
      } catch { /* unreadable file: listed bare */ }
      return { id, pitch: meta.pitch ?? "", budget: meta.budget ?? "", needs: meta.needs ?? "", forked: meta.forked === "true" };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/// Parse a template body. Throws an honest error naming the problem.
export function loadTemplate(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id ?? "")) {
    throw new Error(`bad template id: ${id}`);
  }
  const p = join(bundledDir(), `${id}.yaml`);
  if (!existsSync(p)) {
    const known = listTemplates().map((t) => t.id).join(", ");
    throw new Error(`unknown template: ${id} (available: ${known || "none"})`);
  }
  try {
    return YAML.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`template ${id} does not parse: ${e.message}`);
  }
}

/// Structural validation: returns problems (empty = valid). Mirrors the keys
/// `loadProfile` requires so installed templates always load.
export function validateTemplate(id) {
  const problems = [];
  let doc;
  try {
    doc = loadTemplate(id);
  } catch (e) {
    return [e.message];
  }
  if (!doc || typeof doc !== "object") return [`template ${id}: empty or non-mapping document`];
  if (!doc.name || typeof doc.name !== "string") problems.push("missing string: name");
  if (!doc.model?.provider) problems.push("missing: model.provider");
  if (!Array.isArray(doc.tools) || !doc.tools.length) problems.push("missing: non-empty tools list");
  const steps = Number(doc.limits?.max_steps);
  if (!Number.isFinite(steps) || steps < 1) problems.push("missing/invalid: limits.max_steps (positive number)");
  if (doc.policy?.verify_before_finish !== undefined && !["warn", "enforce", "off"].includes(doc.policy.verify_before_finish)) {
    problems.push("invalid: policy.verify_before_finish must be warn|enforce|off");
  }
  return problems;
}

/// Install into the user profiles dir. Collision-safe: `name`, `name-2`, ...
/// Returns the installed profile name. Never touches bundled files.
export function installTemplate(id, destDir = null) {
  const problems = validateTemplate(id);
  if (problems.length) {
    throw new Error(`template ${id} invalid: ${problems.join("; ")}`);
  }
  const dir = destDir ?? userDir();
  mkdirSync(dir, { recursive: true });
  const text = readFileSync(join(bundledDir(), `${id}.yaml`), "utf8");
  let name = id;
  let n = 1;
  while (existsSync(join(dir, `${name}.yaml`))) {
    n++;
    name = `${id}-${n}`;
  }
  // Installed copy carries its own name so loader + ledger agree. Surgical
  // line replacement keeps header comments and formatting byte-identical.
  const installed = text.replace(/^name:.*$/m, `name: ${name}`);
  writeFileSync(join(dir, `${name}.yaml`), installed);
  return name;
}
