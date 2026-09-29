import test from "node:test";
import assert from "node:assert";
// CLI surface: flags fail fast (never the stdio fallthrough hang), version is
// single-sourced, templates list in scannable rows.
process.env.APE_MAX_CONCURRENT_RUNS ??= "32";
process.env.APE_MAX_DAILY_USD ??= "1000000";
process.env.APE_ALLOW_MOCK_INPUT ??= "1";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("cli: stdio initialize reports the package version", () => {
  const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-07-28" } }) + "\n";
  const r = spawnSync("node", [bin], { input: req, encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 0);
  const msg = JSON.parse(r.stdout.trim().split("\n").find(Boolean));
  assert.equal(msg.result.serverInfo.name, "ape-mcp");
  assert.equal(msg.result.serverInfo.version, pkg.version);
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
