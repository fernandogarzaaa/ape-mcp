// Test runner wrapper: isolates the APE data dir for the whole run so
// `npm test` is idempotent. Several suites do not set APE_DATA_DIR
// themselves, so without this they write into <repo>/.ape (runs.db,
// trace.ndjson, saved profiles, console.port). A second run then sees the
// first run's residue and fails (stale profile files break profile
// listing; ledger/run state leaks across runs). Suites that need their
// own dir still override APE_DATA_DIR at module top as before.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (!process.env.APE_DATA_DIR) {
  process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-test-"));
}

const r = spawnSync(process.execPath, ["--test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
