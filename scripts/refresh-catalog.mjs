#!/usr/bin/env node
// Refresh catalog/freepool.json from each provider's live /models listing,
// using whatever free-tier keys are present in the environment (providers
// without a key are skipped, not guessed). Writes the merged catalog and a
// markdown summary (for the PR body) — never keys, never response bodies.
//
//   node scripts/refresh-catalog.mjs              # write catalog in place
//   node scripts/refresh-catalog.mjs --dry-run    # print the report only
//   node scripts/refresh-catalog.mjs --summary out.md
//
// Run nightly by .github/workflows/refresh-catalog.yml, which opens/updates
// a PR with the diff (no auto-merge). No dependency on any third-party
// catalog service: the source of truth is the providers' own APIs.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverAll, mergeCatalog } from "../src/agent/freepool/catalog-refresh.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "catalog", "freepool.json");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const si = args.indexOf("--summary");
const summaryPath = si >= 0 ? args[si + 1] : null;

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const results = await discoverAll();
const today = new Date().toISOString().slice(0, 10);
const { catalog: next, report, changed } = mergeCatalog(catalog, results, { today });

const lines = ["## freepool catalog refresh", "", `Run: ${today} (UTC). Providers without a key in repo secrets are skipped.`, ""];
for (const [p, r] of Object.entries(report)) {
  if (r.skipped) { lines.push(`- **${p}**: skipped (${r.skipped})`); continue; }
  const parts = [];
  if (r.added.length) parts.push(`added ${r.added.length}: ${r.added.map((x) => `\`${x}\``).join(", ")}`);
  if (r.retired.length) parts.push(`retired ${r.retired.length}: ${r.retired.map((x) => `\`${x}\``).join(", ")}`);
  if (r.revived.length) parts.push(`revived ${r.revived.length}: ${r.revived.map((x) => `\`${x}\``).join(", ")}`);
  lines.push(`- **${p}**: ${parts.join("; ") || "no change"}`);
}
const untouched = Object.keys(catalog.providers ?? {}).filter((p) => !(p in report));
if (untouched.length) lines.push(`- not queried (no key): ${untouched.join(", ")}`);
lines.push("", "New models default to `tools: false` and unknown limits until reviewed; adjust tier/tools/limits before merging.");
const summary = lines.join("\n") + "\n";

process.stdout.write(summary);
if (summaryPath) writeFileSync(summaryPath, summary);
if (!dry && changed) {
  writeFileSync(catalogPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`catalog updated: ${catalogPath}`);
} else if (!changed) {
  console.log("catalog unchanged");
}
