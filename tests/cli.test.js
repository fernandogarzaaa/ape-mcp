import test from "node:test";
import assert from "node:assert";
// CLI surface: flags fail fast (never the stdio fallthrough hang), version is
// single-sourced, templates list in scannable rows.
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { APE_VERSION } from "../src/index.js";
import { discover, toolsList } from "../src/server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "ape-mcp.js");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("cli: version is single-sourced from package.json", () => {
  assert.equal(APE_VERSION, pkg.version);
  assert.equal(discover().server.version, pkg.version);
  // Static MCP metadata must not drift from the release version either.
  assert.equal(pkg.mcp?.server?.version, pkg.version, "package.json mcp.server.version tracks the release");
});

test("cli: --version prints the version and exits 0", () => {
  const out = execFileSync("node", [bin, "--version"], { encoding: "utf8", timeout: 15000 });
  assert.equal(out.trim(), pkg.version);
});

test("cli: --help exits 0 with usage", () => {
  const out = execFileSync("node", [bin, "--help"], { encoding: "utf8", timeout: 15000 });
  assert.ok(out.includes("usage:"), "shows usage");
  for (const word of ["run", "doctor", "templates", "serve"]) {
    assert.ok(out.includes(word), `usage mentions ${word}`);
  }
});

test("cli: unknown flag fails fast with exit 2 (never hangs on stdin)", () => {
  const r = spawnSync("node", [bin, "--bogus-flag"], { encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown flag/);
});

test("cli: templates rejects bad subcommands; prune dry-run is safe", () => {
  const bad = spawnSync("node", [bin, "templates", "bogussub"], { encoding: "utf8", timeout: 15000 });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /usage: ape-mcp templates/);
  const env = { ...process.env, APE_DATA_DIR: mkdtempSync(join(tmpdir(), "ape-prune-cli-")) };
  const r = spawnSync("node", [bin, "prune", "--dry-run"], { encoding: "utf8", env, timeout: 15000 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /prune: 0 removed, 0 kept \(dry run\)/);
});

test("cli: stdio initialize reports the package version", () => {
  const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-07-28" } }) + "\n";
  const r = spawnSync("node", [bin], { input: req, encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 0);
  const msg = JSON.parse(r.stdout.trim().split("\n").find(Boolean));
  assert.equal(msg.result.serverInfo.name, "ape-mcp");
  assert.equal(msg.result.serverInfo.version, pkg.version);
});

test("cli: stdio tools/call on a missing tool is a JSON-RPC error, not a result", () => {
  const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope_x", arguments: {} } }) + "\n";
  const r = spawnSync("node", [bin], { input: req, encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 0, "transport itself is fine");
  const msg = JSON.parse(r.stdout.trim().split("\n").find(Boolean));
  assert.ok(!("result" in msg), "no success-shaped result");
  assert.equal(msg.error.code, -32602);
  assert.match(msg.error.message, /unknown_tool: nope_x/);
});

test("cli: run with a missing tool exits 1 with the name on stderr", () => {
  const r = spawnSync("node", [bin, "run", "nope_x", "{}"], { encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown_tool: nope_x/);
});

test("cli: run ape_agent_run returns promptly while the run is still going", () => {
  // Regression: the start call used to hang until the whole run finished
  // (worker held the parent's stdio/ipc). The load-bearing assertion is
  // behavioral — the run is still going when start returns — not a wall
  // clock bound (loaded CI Windows runners boot node slowly). The mock run
  // lasts 9s+ (3 turns x 3000ms) so any sane start passes with huge margin.
  const env = {
    ...process.env,
    APE_ALLOW_MOCK_INPUT: "1",
    APE_MOCK_STEP_DELAY_MS: "3000",
    APE_DATA_DIR: mkdtempSync(join(tmpdir(), "ape-start-prompt-")),
    APE_MAX_CONCURRENT_RUNS: "32",
    APE_MAX_DAILY_USD: "1000000",
  };
  const script = [
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "skein.orchestrate", args: { op: "status" } },
    { tool: "finish", args: { summary: "prompt" } },
  ];
  const t0 = Date.now();
  const out = execFileSync(
    "node",
    [bin, "run", "ape_agent_run", JSON.stringify({ profile: "repo-triage", objective: "promptness", _mockScript: script })],
    { encoding: "utf8", env, timeout: 30000 }
  );
  const dt = Date.now() - t0;
  const runId = JSON.parse(out).structuredContent.result.run_id;
  assert.ok(runId, "run started");
  const st = JSON.parse(
    execFileSync("node", [bin, "run", "ape_agent_status", JSON.stringify({ run_id: runId })], { encoding: "utf8", env, timeout: 15000 })
  ).structuredContent.result;
  assert.equal(st.status, "running", `run genuinely still going after prompt start (start took ${dt}ms)`);
  assert.ok(dt < 8000, `start returned in ${dt}ms, well inside the 9s+ run`);
});

test("cli: templates list is header + scannable id/tier/pitch rows", () => {
  const out = execFileSync("node", [bin, "templates", "list"], { encoding: "utf8", timeout: 15000, env: { ...process.env } });
  const lines = out.trim().split("\n");
  assert.ok(lines[0].includes("install"), "header names the install command");
  assert.equal(lines.length, 9, "header + eight templates");
  for (const line of lines.slice(1)) {
    assert.match(line, /^ {2}\S+ +\[[^\]]+\] +.{10,120}$/, `scannable row: ${line}`);
  }
});

test("cli: every tool property is documented; import bundle is typed", () => {
  const { tools } = toolsList();
  assert.ok(tools.length >= 31, `expected 31+ tools, got ${tools.length}`);
  for (const t of tools) {
    for (const [k, v] of Object.entries(t.inputSchema.properties || {})) {
      assert.ok(v.description, `${t.name}.${k} has a description`);
      assert.ok(v.type, `${t.name}.${k} has a type`);
    }
  }
  const imp = tools.find((t) => t.name === "ape_agent_import");
  assert.deepEqual(imp.inputSchema.properties.bundle.type, ["object", "string"]);
});
