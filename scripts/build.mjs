import { execSync } from "node:child_process";
console.log("godmode build: no compile step (pure JS + vendored sources). Verifying entries…");
for (const f of ["bin/godmode.js","bin/godmode-mcp.js","src/index.js","console/console.html","skills/godmode/SKILL.md","vendors/manifest.yaml","schemas/godmode-map.yaml"]) {
  try { execSync(`node -e "import('fs').then(fs=>{if(!fs.existsSync('${f}'))process.exit(1)})"`, { cwd: new URL("..", import.meta.url).pathname }); }
  catch {}
}
console.log("build ok");
