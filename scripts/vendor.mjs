import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GODMODE_NO_AGPL = process.env.GODMODE_NO_AGPL === "1";

const jobs = [
  { src: "C:\\Users\\garza\\genesis_repo", dest: "vendors/genesis",
    keep: ["src","bin","adapters","benchmarks","templates","fixtures","examples","tests","docs","plugins","tools","package.json","package-lock.json","tsconfig.json","tsconfig.build.json","biome.json","vitest.config.ts","README.md","LICENSE",".claude-plugin"] },
  { src: "E:\\workspace\\experience-validation-engine", dest: "vendors/eve",
    keep: ["src","bin","protocol","skills","docs","examples","tests","scripts","package.json","package-lock.json","tsconfig.json","tsconfig.build.json","biome.jsonc","vitest.config.ts","eve.config.example.yaml","README.md","LICENSE","ROADMAP.md","CONTRIBUTING.md","SECURITY.md",".claude",".codex",".claude-plugin"] },
  { src: "C:\\Users\\garza\\ADAM", dest: "vendors/adam",
    keep: ["crates","bin","protocol","skills","scripts","src","Cargo.toml","Cargo.lock","Dockerfile","README.md","ARCHITECTURE.md","DESIGN.md","ROADMAP.md","LICENSE",".claude-plugin",".mcp.json"] },
  { src: "E:\\skein", dest: "vendors/skein",
    keep: ["src","tests","docs","pyproject.toml","README.md","CHANGELOG.md",".github"] },
  { src: "C:\\Users\\garza\\EVE---MIRO", dest: "vendors/eve-miro",
    keep: ["src","eve","schemas","datasets","apps","core","providers","streaming","storage","experiments","scripts","infrastructure","docs","tests","pyproject.toml","Makefile","docker-compose.yml","install.sh","install.ps1","README.md","NOTICE.md","LICENSE","CHANGELOG.md",".env.example",".github"] },
];

let report = { mode: GODMODE_NO_AGPL ? "MIT-only" : "full+AGPL-noticed", jobs: [] };
for (const j of jobs) {
  const src = j.src, dest = join(root, j.dest);
  if (!existsSync(src)) { report.jobs.push({ dest: j.dest, status: "missing-src" }); continue; }
  mkdirSync(dest, { recursive: true });
  let copied = [];
  for (const k of j.keep) {
    const s = join(src, k), d = join(dest, k);
    if (GODMODE_NO_AGPL && j.dest === "vendors/eve-miro" && k === "eve") { /* still copy eve (MIT) */ }
    if (!existsSync(s)) continue;
    try {
      if (k === "mirofish" || s.endsWith("mirofish")) continue; // handled below
      cpSync(s, d, { recursive: true, force: true });
      copied.push(k);
    } catch (e) { report.jobs.push({ dest: j.dest, keep: k, status: "error: " + String(e).slice(0, 120) }); }
  }
  // mirofish AGPL boundary: copy only when allowed, always with license marker
  if (j.dest === "vendors/eve-miro") {
    const ms = join(src, "mirofish");
    if (GODMODE_NO_AGPL) {
      writeFileSync(join(dest, "mirofish.EXCLUDED"),
        "mirofish/ excluded by GODMODE_NO_AGPL=1 (AGPL-3.0). MIT-only build.\n");
    } else if (existsSync(ms)) {
      const md = join(dest, "mirofish");
      cpSync(ms, md, { recursive: true, force: true,
        filter: (p) => !p.includes(".venv") && !p.includes("__pycache__") && !p.includes(".git") });
      copied.push("mirofish[AGPL-3.0, see NOTICE.md]");
    }
  }
  report.jobs.push({ dest: j.dest, status: "ok", copied });
}
writeFileSync(join(root, "vendors", "vendor-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
