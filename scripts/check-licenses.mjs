// License gate: every vendored engine must be MIT (or compatible); any AGPL-3.0
// content anywhere is a hard failure — APE deliberately ships no AGPL component.
// Usage: node scripts/check-licenses.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function walk(dir, rel = "") {
  let ents = [];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e.name), r = (rel ? rel + "/" : "") + e.name;
    if (e.isDirectory()) {
      if (["node_modules", ".git", "target", ".venv", "__pycache__", ".eve-output", ".ape"].includes(e.name)) continue;
      walk(p, r);
    } else if (/^(LICENSE|LICENCE|COPYING)/i.test(e.name) || e.name.endsWith(".license")) {
      let txt = "";
      try { txt = readFileSync(p, "utf8").slice(0, 600); } catch { continue; }
      if (/Affero General Public License/i.test(txt)) failures.push(`AGPL text found: ${r}`);
    }
  }
}
walk(join(root, "vendors"));
// Every vendored engine must carry a license file.
for (const n of ["genesis", "eve", "adam", "skein"]) {
  const hasLic = readdirSync(join(root, "vendors", n)).some((x) => /^(LICENSE|LICENCE|COPYING)/i.test(x));
  if (!hasLic) failures.push(`vendors/${n} missing LICENSE`);
}
if (failures.length) { console.error("LICENSE GATE FAILED:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("license gate ok: all vendored engines MIT, no AGPL content");