import { execFile } from "node:child_process";
import { existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const V = (p) => join(root, "vendors", p);

// Async execFile — never blocks the event loop. Timeout kills the child and returns
// a structured error, so long engine runs stay non-blocking and are task-shaped by callers.
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { encoding: "utf8", timeout: 120000, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stdout || stderr || err.message || err).slice(0, 4000);
        resolve({ ok: false, output: msg, code: err.code ?? null });
      } else {
        resolve({ ok: true, output: String(stdout).slice(0, 4000) });
      }
    });
    if (opts.timeout) {
      setTimeout(() => { try { child.kill(); } catch { /* already gone */ } }, opts.timeout + 1000);
    }
  });
}
const fail = (engine, detail) => ({
  error: "engine_not_configured", engine, detail,
  hint: "Run `ape-mcp doctor` — missing build/key/service. Never a silent stub."
});
export const engineFail = fail;

// Every engine below shells out to IN-PLUGIN vendored paths only.
// No git clone, no npx -y <other-repo>, no network fetch at runtime.

export function genesisSuites() {
  const suites = ["code", "json", "math", "behavioral"];
  return { suites, ledger: "vendors/genesis/src/ledger", note: "controls required; see vendors/genesis/src/assurance" };
}
export function genesisEntry() {
  const cands = [V("genesis/dist/cli/run.js"), V("genesis/bin/genesis.js")];
  return cands.find((p) => existsSync(p)) ?? null;
}
export function eveEntry() {
  const cands = [V("eve/bin/eve.js"), V("eve/dist/cli/main.js")];
  return cands.find((p) => existsSync(p)) ?? null;
}
export function runNode(entry, args, opts = {}) {
  return run("node", [entry, ...args], opts);
}
export function failEve() {
  return fail("eve", "bin/eve.js + dist missing; build vendors/eve");
}
export function adamBin() {
  const cands = [
    V("adam/target/release/adam-mcp"), V("adam/target/release/adam-mcp.exe"),
    V("adam/target/debug/adam-mcp"), V("adam/target/debug/adam-mcp.exe"),
  ];
  // vendors/adam/bin/adam-mcp is a self-build shell wrapper, not a binary — excluded.
  return cands.find((p) => existsSync(p)) ?? null;
}
export function skeinSrc() {
  return existsSync(V("skein/src/skein/cli.py")) ? V("skein/src") : null;
}

function ledgerSummary(entry) {
  try {
    const dir = process.env.APE_DATA_DIR || join(process.cwd(), ".ape");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "ledger.jsonl"), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch { /* ledger never breaks calls */ }
}

export const dispatch = {
  status({ organism_id = "default" } = {}) {
    return {
      version: "1.0.0", protocol: "2026-07-28", organism_id,
      engines: {
        genesis: genesisEntry() ? "vendored" : "vendored-unbuilt",
        eve: eveEntry() ? "vendored" : "vendored-unbuilt",
        adam: adamBin() ? "vendored" : "vendored-unbuilt",
        skein: skeinSrc() ? "vendored" : "missing",
      },
      vendors: "vendors/manifest.yaml",
    };
  },
  async audit_claim({ suite = "code", verifier = "" } = {}) {
    const e = genesisEntry();
    if (!e) return { ...fail("genesis", "dist not built; run npm run build in vendors/genesis"), suites: genesisSuites().suites };
    if (!verifier) return { verdict: "UNTESTED", suite, rates: null, findings: [], note: "pass verifier to run; suites listed", suites: genesisSuites().suites };
    // Evidence-persistent by default: every audit lands in the hash-chained ledger.
    const ledger = join(process.env.APE_DATA_DIR || join(process.cwd(), ".ape"), "genesis-ledger.db");
    const r = await run("node", [e, "audit", "--suite", suite, "--verifier", verifier, "--ledger", ledger]);
    if (r.ok && r.output) {
      const m = r.output.match(/Ledger: entry (\w+)/);
      if (m) ledgerSummary({ kind: "genesis.audit", suite, verdict: /VERDICT:\s+(\S+)/.exec(r.output)?.[1], ledger_entry: m[1] });
    }
    return { suite, ledger, ...r };
  },
  async validate_experience({ url = "mock:", persona = "curious-explorer", seed = 7 } = {}) {
    const e = eveEntry();
    if (!e) return fail("eve", "bin/eve.js + dist missing; build vendors/eve");
    const r = await run("node", [e, "run", url, "--persona", persona, "--seed", String(seed), "--quiet"]);
    return { url, persona, seed, ...r, report: ".ape/eve-report (see ape_report)" };
  },
  async compare({ run_a = "", run_b = "" } = {}) {
    const e = genesisEntry();
    if (!e) return fail("genesis", "dist not built; run npm run build in vendors/genesis");
    if (!run_a || !run_b) return { note: "pass run_a and run_b result dirs; genesis compare <run-a> <run-b>", runs: [run_a, run_b] };
    const r = await run("node", [e, "compare", run_a, run_b]);
    return { run_a, run_b, ...r };
  },
  async orchestrate({ op = "status", node = "", agent_id = "ape-mcp" } = {}) {
    const s = skeinSrc();
    if (!s) return fail("skein", "vendors/skein/src missing");
    const py = process.env.APE_PYTHON || "python";
    const map = { status: ["status"], graph: ["graph"], claim: ["claim", node, "--agent-id", agent_id], release: ["release", node], log: ["log", "--node", node] };
    const args = map[op] ?? ["status"];
    const r = await run(py, ["-m", "skein.cli", ...args].filter(Boolean), {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONPATH: s },
    });
    return { op, node, ...r };
  },
};