// Test runner wrapper: isolates the APE data dir for the whole run so
// `npm test` is idempotent. Several suites do not set APE_DATA_DIR
// themselves, so without this they write into <repo>/.ape (runs.db,
// trace.ndjson, saved profiles, console.port). A second run then sees the
// first run's residue and fails (stale profile files break profile
// listing; ledger/run state leaks across runs). Suites that need their
// own dir still override APE_DATA_DIR at module top as before.
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (!process.env.APE_DATA_DIR) {
  process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-test-"));
}

// Harness invariant (Phase 13): every declared test file must exist. A
// missing file (renamed/removed suite left in package.json) must fail the
// run loudly — green CI must never silently mean "one suite never ran".
const declared = process.argv.slice(2).filter((a) => !a.startsWith("-"));
let missing = false;
for (const f of declared) {
  if (!existsSync(join(process.cwd(), f))) {
    console.error(`test harness: declared test file missing: ${f} (remove it from the package.json test script or restore it)`);
    missing = true;
  }
}
if (missing) process.exit(1);

const r = spawnSync(process.execPath, ["--test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
