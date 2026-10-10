// CI guard: no UTF-8 BOMs in repo text files.
// A BOM before a shebang breaks npm bin shims on Linux/macOS (the kernel no
// longer sees #!). Node tolerates BOMs, which is why this regresses silently:
// PR #12 stripped them repo-wide, the remote-transport merge reintroduced
// them, and nothing caught it until `npm i -g ape-mcp` broke.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["bin", "src", "scripts", "tests", "docs", "deploy", "console", "mods", "profiles", "connectors", "skills", "schemas", "catalog", ".github"];
const TOP_FILES = ["package.json", ".npmignore", "install.sh", "install.ps1", "ape.config.example.yaml", "mcpServers.json"];
const SKIP_DIRS = new Set(["node_modules", ".git", "target", "dist", ".venv"]);

const bad = [];
function checkFile(p) {
  let b;
  try { b = readFileSync(p); } catch { return; }
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) bad.push(p);
}
function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) {
      if (!SKIP_DIRS.has(e)) walk(p);
    } else {
      checkFile(p);
    }
  }
}
for (const r of ROOTS) { try { walk(r); } catch { /* missing dir is fine */ } }
for (const f of TOP_FILES) checkFile(f);

if (bad.length) {
  console.error(`BOM-prefixed files (${bad.length}):\n${bad.join("\n")}`);
  process.exit(1);
}
console.log("no BOMs");
