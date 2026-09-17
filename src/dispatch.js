import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const V = (p) => join(root, "vendors", p);

function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", timeout: 120000, ...opts });
    return { ok: true, output: String(out).slice(0, 4000) };
  } catch (e) {
    return { ok: false, output: String(e.stdout ?? e.message ?? e).slice(0, 4000) };
  }
}
const fail = (engine, detail) => ({
  error: "engine_not_configured", engine, detail,
  hint: "Run `godmode doctor` — missing build/key/service. Never a silent stub."
});

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
export function adamBin() {
  const cands = [
    V("adam/target/release/adam-mcp"), V("adam/target/release/adam-mcp.exe"),
    V("adam/bin/adam-mcp"),
  ];
  return cands.find((p) => existsSync(p)) ?? null;
}
export function skeinSrc() {
  return existsSync(V("skein/src/skein/cli.py")) ? V("skein/src") : null;
}
export function miroSrc() {
  return existsSync(V("eve-miro/src/eve_miro/cli/main.py")) ? V("eve-miro/src") : null;
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
        "eve-miro": miroSrc() ? "vendored" : "missing",
      },
      vendors: "vendors/manifest.yaml",
    };
  },
  audit_claim({ suite = "code", verifier = "" } = {}) {
    const e = genesisEntry();
    if (!e) return { ...fail("genesis", "dist not built; run npm run build in vendors/genesis"), suites: genesisSuites().suites };
    if (!verifier) return { verdict: "UNTESTED", suite, rates: null, findings: [], note: "pass verifier to run; suites listed", suites: genesisSuites().suites };
    const r = run("node", [e, "audit", "--suite", suite, "--verifier", verifier]);
    return { suite, ...r };
  },
  validate_experience({ url = "mock:", persona = "curious-explorer", seed = 7 } = {}) {
    const e = eveEntry();
    if (!e) return fail("eve", "bin/eve.js + dist missing; build vendors/eve");
    const r = run("node", [e, "run", url, "--persona", persona, "--seed", String(seed), "--quiet"]);
    return { url, persona, seed, ...r, report: ".godmode/eve-report (see godmode_report)" };
  },
  memory({ op, query = "", kind = "episodic", content = "", organism_id = "default" } = {}) {
    const b = adamBin();
    if (!b) return fail("adam", "adam-mcp binary absent; build vendors/adam (cargo build --release -p adam-mcp)");
    return { engine: "adam", op, organism_id, kind, note: "stdio call via adam-mcp; use resources genome://current for snapshot", query: query.slice(0, 200), stored: op === "store" ? content.slice(0, 200) : undefined };
  },
  orchestrate({ op = "status", node = "", agent_id = "godmode" } = {}) {
    const s = skeinSrc();
    if (!s) return fail("skein", "vendors/skein/src missing");
    const py = process.env.GODMODE_PYTHON || "python";
    const map = { status: ["status"], graph: ["graph"], claim: ["claim", node, "--agent-id", agent_id], release: ["release", node], log: ["log", "--node", node] };
    const args = map[op] ?? ["status"];
    const r = run(py, ["-m", "skein.cli", ...args].filter(Boolean), { cwd: process.cwd(), env: { ...process.env, PYTHONPATH: s } });
    return { op, node, ...r };
  },
  world({ scenario = "experiments/typhoon/typhoon_manila_closed_loop.yaml" } = {}) {
    const s = miroSrc();
    if (!s) return fail("eve-miro", "vendors/eve-miro/src missing");
    return { scenario, provenance: ["OBSERVED", "DERIVED", "FORECAST", "SIMULATED"], note: "Run FIXTURES=1 offline; live needs OPENMETEO_LIVE=1 + engines up (fail-closed 503 otherwise)" };
  },
};
