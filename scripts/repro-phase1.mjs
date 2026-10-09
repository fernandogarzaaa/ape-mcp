// Phase 1 repro: proves H1,H2,H3,M2(floors),M4,M6 against the UNPATCHED tree.
// Run: node scripts/repro-phase1.mjs (temp dirs only; mock providers; one local HTTP server for M6-neutral + M4).
// Exit 0 always; prints REPRO <id> <EVIDENCE> lines. Does not modify the repo.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-repro-"));
process.env.APE_MAX_CONCURRENT_RUNS = "32";
process.env.APE_MAX_DAILY_USD = "1000000";
process.env.APE_ALLOW_MOCK_INPUT = "1";

const { admitRun, recordStep, getRun, importRun } = await import("../src/runs.js");
const { sliceChildBudget } = await import("../src/agent/registry.js");
const { ipBlocked } = await import("../src/connectors.js");

// H1: secret in step summary persists raw in the ledger row.
{
  const adm = admitRun({ profile: "repo-triage", model: "mock-model", objective: "repro" });
  recordStep(adm.run_id, { step: 1, kind: "tool", tool: "probe", resultSummary: 'upstream says use key sk-test-ABCD1234EFGH5678 ok' });
  const row = getRun(adm.run_id);
  const last = row.steps[row.steps.length - 1];
  console.log("REPRO H1 raw-secret-in-ledger:", last.result_summary.includes("sk-test-ABCD1234EFGH5678") ? "PRESENT (unredacted)" : "redacted");
}

// H2: import accepts uncapped steps + negative resumes + absurd checkpoint.
{
  const src = admitRun({ profile: "repo-triage", model: "mock-model", objective: "src" });
  const steps = [];
  for (let i = 0; i < 5000; i++) steps.push({ step: i, kind: "tool", tool: "x", resultSummary: "s" });
  const out = importRun({
    version: 1, run: { run_id: src.run_id, resumes: -100 },
    steps, checkpoint: { step: -5, state: { budget: { steps: -9, tokens: 1e15, usd: 1e18 }, anything: "goes" } },
  });
  console.log("REPRO H2 import accepted:", JSON.stringify({ error: out.error ?? null, steps_imported: out.steps_imported, resume_count: out.resume_count }));
}

// M2 floors: nearly-exhausted parent still grants a floor above remaining.
{
  const s = sliceChildBudget({ stepsLeft: 5, tokensLeft: 2, usdLeft: 0.0004, wallMsLeft: 3000 }, 0.25);
  console.log("REPRO M2 floor-vs-remaining:", JSON.stringify({ usdLeft: 0.0004, child_max_usd: s.limits?.max_usd, wallMsLeft: 3000, child_wall_s: s.limits?.max_wall_seconds }));
}

// M6: hex-form IPv4-mapped IPv6 loopback not recognized.
{
  console.log("REPRO M6 ::ffff:7f00:1 blocked?", ipBlocked("::ffff:7f00:1"));
}

// M4 + H3 need servers; M4 via console /api/call with 5MB body (bearerless pre-check skipped: use startConsole? needs token).
// Use the raw http layer instead: POST 5MB to a parsers-less endpoint is code-evident; live-check /api/trace GET cap instead.
{
  const { startConsole, consoleSessionToken } = await import("../src/console.js");
  const started = await startConsole({ port: 0, host: "127.0.0.1" });
  const token = consoleSessionToken();
  const big = "x".repeat(5 * 1024 * 1024);
  const status = await new Promise((resolve) => {
    const req = http.request(`http://127.0.0.1:${started.port}/api/call`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": Buffer.byteLength(big) + 64 },
    }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
    req.on("error", (e) => resolve("ERR:" + e.message));
    req.write(JSON.stringify({ name: "ape_status", arguments: {} }).slice(0, 64));
    req.write(big);
    req.end();
  });
  console.log("REPRO M4 5MB-body-to-/api/call status:", status, "(413=capped, else uncapped)");
  started.server.close();
}

// H3: ape_report pass-through (no APE-layer path check) — dispatch-level only.
{
  const { dispatchCall } = await import("../src/server.js");
  const out = await dispatchCall("ape_report", { ref: "/etc/hostname" });
  const flat = JSON.stringify(out).slice(0, 200);
  console.log("REPRO H3 report-outside-root:", flat);
}
process.exit(0);
