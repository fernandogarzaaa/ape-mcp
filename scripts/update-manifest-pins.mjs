// Update vendors/manifest.yaml pins from CHANGED/SHAS env (auto-update workflow).
// Usage: CHANGED='["genesis","eve"]' SHAS='{"genesis":"<sha>","eve":"<sha>"}'
//        node scripts/update-manifest-pins.mjs
//
// This is a plain .mjs file on purpose, not a node -e one-liner. The old
// workflow step ran the same regex through a shell double-quote layer,
// which collapsed the pattern's \S to a literal S, so the replace never
// matched and every sync PR shipped stale manifest pins. Proven by PR 146:
// its single commit re-vendors all four sources and updates
// vendors/vendor-report.json, but never touches vendors/manifest.yaml.
// This script fails loud when any pin has no match, so a silent no-op
// can never again produce a sync PR with stale pins.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const changed = JSON.parse(process.env.CHANGED || "[]");
const shas = JSON.parse(process.env.SHAS || "{}");
let txt = readFileSync(join(root, "vendors", "manifest.yaml"), "utf8");
for (const n of changed) {
  const re = new RegExp(`(  ${n}:\n(?:.*\n)*?    pin: )\\S+`);
  if (!re.test(txt)) throw new Error(`no manifest pin match for ${n}`);
  txt = txt.replace(re, `$1${shas[n]}`);
  console.log(`pin updated: ${n} -> ${shas[n]}`);
}
writeFileSync(join(root, "vendors", "manifest.yaml"), txt);
