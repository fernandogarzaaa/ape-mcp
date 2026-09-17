// AGPL boundary gate: fails if AGPL-licensed content appears outside vendors/eve-miro/mirofish,
// or if the mirofish license itself changes away from AGPL-3.0 without a NOTICE.md update.
// Usage: node scripts/check-licenses.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AGPL_ALLOWED_PREFIX } from "./vendor-config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function walk(dir, rel = "") {
  let ents = [];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e.name), r = (rel ? rel + "/" : "") + e.name;
    if (e.isDirectory()) {
      if (["node_modules", ".git", "target", ".venv", "__pycache__", ".eve-output", ".godmode"].includes(e.name)) continue;
      walk(p, r);
    } else if (/^(LICENSE|LICENCE|COPYING)/i.test(e.name) || e.name.endsWith(".license")) {
      let txt = "";
      try { txt = readFileSync(p, "utf8").slice(0, 600); } catch { continue; }
      const agpl = /Affero General Public License/i.test(txt);
      const inAllowed = ("vendors/" + r).startsWith(AGPL_ALLOWED_PREFIX) || r.startsWith("vendors/eve-miro/mirofish");
      if (agpl && !inAllowed) failures.push(`AGPL text outside boundary: ${r}`);
    }
  }
}
walk(join(root, "vendors"));
// mirofish license must still exist and still be AGPL-3.0 (drift = human review).
const mf = join(root, "vendors", "eve-miro", "mirofish", "LICENSE");
const mx = join(root, "vendors", "eve-miro", "mirofish.EXCLUDED");
if (!existsSync(mf) && !existsSync(mx)) {
  failures.push("mirofish/ LICENSE missing and no mirofish.EXCLUDED marker — re-run vendor/sync");
} else if (existsSync(mf) && !/Affero General Public License/i.test(readFileSync(mf, "utf8").slice(0, 600))) {
  failures.push("mirofish/LICENSE no longer reads as AGPL — update NOTICE.md before merging");
}
if (failures.length) { console.error("LICENSE GATE FAILED:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("license gate ok: AGPL confined to vendors/eve-miro/mirofish");
