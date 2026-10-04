import test from "node:test";
import assert from "node:assert";
// H3: ape_report refs are sandboxed to the run-data directory (canonicalized:
// no absolute escape, no .. escape, no symlink escape) and must be results
// directories (genesis reads verdict.json inside, never an arbitrary file).
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-report-sec-"));
import { dispatchCall, resolveReportRef } from "../src/server.js";
import { dataDir } from "../src/trace.js";

test("report gate: legitimate artifact dir passes", async () => {
  const dir = join(dataDir(), "eve-report-test");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "verdict.json"), JSON.stringify({ verdict: "SUPPORTED", summary: "probe", scope: {} }));
  const gate = resolveReportRef("eve-report-test");
  assert.equal(gate.ok, true, JSON.stringify(gate).slice(0, 200));
  const out = await dispatchCall("ape_report", { ref: "eve-report-test" });
  const flat = JSON.stringify(out);
  assert.ok(!/ref_outside_datadir|ref_not_a_directory|ref_not_found/.test(flat), `gate passed, got: ${flat.slice(0, 200)}`);
  assert.ok(out.structuredContent.ok, "report dispatch succeeded");
  assert.match(out.structuredContent.result.output, /VERDICT:\s+SUPPORTED/);
});

test("report gate: absolute path outside the root is rejected", async () => {
  const outside = join(tmpdir(), "ape-report-outside.txt");
  writeFileSync(outside, "not an artifact");
  const gate = resolveReportRef(outside);
  assert.equal(gate.ok, false);
  assert.equal(gate.error, "ref_outside_datadir");
  const out = await dispatchCall("ape_report", { ref: outside });
  assert.equal(out.structuredContent.result.error, "ref_outside_datadir");
});

test("report gate: dot-dot escape is rejected", () => {
  const outside = mkdtempSync(join(tmpdir(), "ape-report-dotdot-"));
  writeFileSync(join(outside, "escape.txt"), "outside artifact root");
  const gate = resolveReportRef(join("..", basename(outside), "escape.txt"));
  assert.equal(gate.ok, false);
  assert.equal(gate.error, "ref_outside_datadir");
});

test("report gate: symlink escape is rejected", (t) => {
  const target = mkdtempSync(join(tmpdir(), "ape-report-target-"));
  const link = join(dataDir(), "evil-link");
  try {
    symlinkSync(target, link, "dir");
  } catch (e) {
    t.skip(`cannot create symlinks here (${e.code}); sandbox logic covered by realpath compare`);
    return;
  }
  const gate = resolveReportRef("evil-link");
  assert.equal(gate.ok, false);
  assert.equal(gate.error, "ref_outside_datadir");
});

test("report gate: plain file inside the root is rejected (dir required)", async () => {
  const f = join(dataDir(), "ledger.jsonl");
  writeFileSync(f, "{}\n");
  const gate = resolveReportRef("ledger.jsonl");
  assert.equal(gate.ok, false);
  assert.equal(gate.error, "ref_not_a_directory");
  const out = await dispatchCall("ape_report", { ref: "ledger.jsonl" });
  assert.equal(out.structuredContent.result.error, "ref_not_a_directory");
});

test("report gate: nonexistent ref is an honest not-found, omitted ref lists", async () => {
  const gate = resolveReportRef("nope-missing-dir");
  assert.equal(gate.ok, false);
  assert.equal(gate.error, "ref_not_found");
  const out = await dispatchCall("ape_report", {});
  assert.ok(Array.isArray(out.structuredContent.result.artifacts), "omitted ref still lists artifacts");
});
