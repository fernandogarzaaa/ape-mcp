// Agent templates: registry, validation, install, staleness, CLI leaf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import YAML from "yaml";

process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-templates-"));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { listTemplates, loadTemplate, validateTemplate, installTemplate, templateMeta } =
  await import("../src/agent/templates.js");

const EXPECTED = [
  "code-reviewer",
  "data-analyst",
  "deep-researcher",
  "fact-checker",
  "meeting-prep",
  "planner",
  "support-triage",
  "writer",
];

test("templates: all eight ship with metadata", () => {
  const ids = listTemplates().map((t) => t.id);
  assert.deepEqual(ids, EXPECTED, "exact template set, sorted");
  for (const t of listTemplates()) {
    assert.ok(t.pitch, `${t.id} has a pitch`);
    assert.ok(t.budget, `${t.id} names a budget tier`);
  }
});

test("templates: every template validates clean", () => {
  for (const id of EXPECTED) {
    assert.deepEqual(validateTemplate(id), [], `${id} valid`);
  }
});

test("templates: unknown/bad ids fail honestly", () => {
  assert.throws(() => loadTemplate("nope-missing"), /unknown template.*available/);
  assert.throws(() => loadTemplate("../evil"), /bad template id/);
  assert.deepEqual(validateTemplate("nope-missing").length > 0, true);
});

test("templates: install copies, renames on collision, keeps headers", async () => {
  const { loadProfile } = await import("../src/agent/profiles.js");
  const first = installTemplate("writer");
  assert.equal(first, "writer");
  const second = installTemplate("writer");
  assert.equal(second, "writer-2", "collision-safe rename");
  const p = loadProfile("writer");
  assert.equal(p.name, "writer", "installed copy loads under its own name");
  assert.equal(p.policy.verify_before_finish, "off", "policy survives install");
  const installed = readFileSync(join(process.env.APE_DATA_DIR, "profiles", "writer.yaml"), "utf8");
  assert.ok(templateMeta(installed).pitch, "header comments preserved in installed copy");
  assert.ok(!existsSync(join(root, "profiles", "writer.yaml")), "bundled dir untouched (writer is template-only)");
});

test("templates: mirrored bundled profiles stay in sync (or declare fork)", () => {
  for (const id of ["code-reviewer", "planner"]) {
    const tpl = YAML.parse(readFileSync(join(root, "profiles", "templates", `${id}.yaml`), "utf8"));
    const bundled = YAML.parse(readFileSync(join(root, "profiles", `${id}.yaml`), "utf8"));
    const forked = templateMeta(readFileSync(join(root, "profiles", "templates", `${id}.yaml`), "utf8")).forked === "true";
    if (!forked) {
      assert.deepEqual(tpl, bundled, `${id} template mirrors bundled profile (or mark forked: true)`);
    }
  }
});

test("templates: CLI list + install work end to end", () => {
  const bin = join(root, "bin", "ape-mcp.js");
  const env = { ...process.env };
  const list = execFileSync("node", [bin, "templates", "list"], { encoding: "utf8", env });
  assert.ok(list.includes("deep-researcher"), "list shows templates");
  const one = execFileSync("node", [bin, "templates", "install", "fact-checker"], { encoding: "utf8", env });
  assert.ok(one.includes("installed profile: fact-checker"), "install reports name");
  assert.ok(existsSync(join(process.env.APE_DATA_DIR, "profiles", "fact-checker.yaml")));
});
