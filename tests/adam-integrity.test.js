import test from "node:test";
import assert from "node:assert/strict";
// M8: ADAM prebuilt integrity is fail-closed by default. Valid checksum
// (pin or sidecar) installs; mismatch / missing proof refuses and deletes;
// explicit opt-out is the only unverified path. Recorded sidecars make
// present binaries re-verifiable (stale swaps fail instead of running).
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const dir = mkdtempSync(join(tmpdir(), "ape-adam-int-"));
const { assetFor, installAdam, verifyPresent, provePresent, parseChecksumFile, verifyChecksum, sidecarPathFor } = await import("../scripts/fetch-adam.mjs");
const { verifiedAdamBinary } = await import("../src/adam-client.js");

const BYTES = Buffer.from("fake-adam-binary-bytes");
const HEX = createHash("sha256").update(BYTES).digest("hex");
const dest = () => join(dir, `adam-${Math.random().toString(36).slice(2)}`);
const fakeFetch = (d) => (url, dst) => writeFileSync(dst ?? d, BYTES);
const sidecar = (hex) => () => `${hex}  adam-mcp-linux-x64\n`;
const noSidecar = () => { throw new Error("404"); };

test("integrity: pin verified installs and records a sidecar", () => {
  const d = dest();
  const r = installAdam({ asset: "adam-mcp-linux-x64", dest: d, url: "https://x/y", fetchImpl: fakeFetch(d), sidecarImpl: noSidecar, pin: HEX });
  assert.equal(r.status, "installed");
  assert.equal(r.verified, "pin");
  assert.ok(existsSync(d), "binary kept");
  assert.ok(readFileSync(sidecarPathFor(d), "utf8").includes(HEX.slice(0, 16)), "sidecar recorded");
});

test("integrity: pin mismatch refuses and deletes", () => {
  const d = dest();
  const r = installAdam({ asset: "adam-mcp-linux-x64", dest: d, url: "https://x/y", fetchImpl: fakeFetch(d), sidecarImpl: noSidecar, pin: "0".repeat(64) });
  assert.equal(r.status, "refused");
  assert.equal(r.reason, "mismatch");
  assert.ok(!existsSync(d), "bad binary deleted");
});

test("integrity: valid sidecar installs when no pin is set", () => {
  const d = dest();
  const r = installAdam({ asset: "adam-mcp-linux-x64", dest: d, url: "https://x/y", fetchImpl: fakeFetch(d), sidecarImpl: sidecar(HEX) });
  assert.equal(r.status, "installed");
  assert.equal(r.verified, "sidecar");
  assert.ok(existsSync(d));
});

test("integrity: no proof refuses by default, even with silent sidecar", () => {
  const d = dest();
  const r = installAdam({ asset: "adam-mcp-linux-x64", dest: d, url: "https://x/y", fetchImpl: fakeFetch(d), sidecarImpl: noSidecar });
  assert.equal(r.status, "refused");
  assert.equal(r.reason, "no-checksum");
  assert.ok(!existsSync(d), "unverified binary deleted, not installed");
});

test("integrity: explicit opt-out is the only unverified path", () => {
  const d = dest();
  const r = installAdam({ asset: "adam-mcp-linux-x64", dest: d, url: "https://x/y", fetchImpl: fakeFetch(d), sidecarImpl: noSidecar, allowUnverified: true });
  assert.equal(r.status, "installed");
  assert.equal(r.verified, null);
  assert.ok(r.warn.includes("WITHOUT integrity verification"));
  assert.ok(existsSync(d));
});

test("integrity: present binary re-verifies; swapped binary fails", () => {
  const d = dest();
  installAdam({ asset: "adam-mcp-linux-x64", dest: d, url: "https://x/y", fetchImpl: fakeFetch(d), sidecarImpl: sidecar(HEX) });
  assert.equal(verifyPresent(d).status, "present");
  assert.equal(verifyPresent(d).verified, "recorded");
  writeFileSync(d, Buffer.from("tampered-bytes"));
  const v = verifyPresent(d);
  assert.equal(v.status, "refused", "stale/swapped binary refused");
  assert.ok(!existsSync(d), "swapped binary deleted");
});

test("integrity: present binary with no record is unverifiable (fail closed)", () => {
  const d = dest();
  writeFileSync(d, BYTES);
  const v = verifyPresent(d);
  assert.equal(v.status, "unverifiable", "presence alone proves nothing");
  assert.equal(v.reason, "no-record");
});

test("integrity: online proof heals an intact-but-unrecorded binary", () => {
  const d = dest();
  writeFileSync(d, BYTES);
  const good = () => `${HEX}  adam-mcp-linux-x64\n`;
  const p = provePresent({ asset: "adam-mcp-linux-x64", dest: d, tag: "v9.9.9", sidecarImpl: good });
  assert.equal(p.status, "present");
  assert.equal(p.verified, "sidecar");
  assert.equal(verifyPresent(d).status, "present", "proof is recorded for next time");
});

test("integrity: online proof refuses a swapped binary, unreachable sidecar stays unverifiable", () => {
  const d = dest();
  writeFileSync(d, BYTES);
  const wrong = () => `${"f".repeat(64)}  adam-mcp-linux-x64\n`;
  const bad = provePresent({ asset: "adam-mcp-linux-x64", dest: d, tag: "v9.9.9", sidecarImpl: wrong });
  assert.equal(bad.status, "refused");
  assert.ok(!existsSync(d), "swapped binary deleted");
  const d2 = dest();
  writeFileSync(d2, BYTES);
  const off = provePresent({ asset: "adam-mcp-linux-x64", dest: d2, tag: "v9.9.9", sidecarImpl: () => { throw new Error("offline"); } });
  assert.equal(off.status, "unverifiable");
  assert.ok(existsSync(d2), "unproven file left alone (refusal is about trust, not deletion)");
});

test("integrity: runtime selection enforces proof, trusts local builds, honors opt-out", () => {
  const prevDir = process.env.APE_ADAM_BIN_DIR;
  const prevOpt = process.env.APE_ADAM_ALLOW_UNVERIFIED;
  const base = mkdtempSync(join(tmpdir(), "ape-adam-rt-"));
  mkdirSync(join(base, "release"), { recursive: true });
  mkdirSync(join(base, "debug"), { recursive: true });
  process.env.APE_ADAM_BIN_DIR = base;
  delete process.env.APE_ADAM_ALLOW_UNVERIFIED;
  try {
    const exe = process.platform === "win32" ? "adam-mcp.exe" : "adam-mcp";
    const rel = join(base, "release", exe);
    const dbg = join(base, "debug", exe);
    assert.equal(verifiedAdamBinary(), null, "nothing present -> null (unavailable)");
    writeFileSync(rel, BYTES);
    assert.equal(verifiedAdamBinary(), null, "release binary without proof is not selected");
    writeFileSync(rel + ".sha256", `${HEX}  ${exe}\n`);
    assert.equal(verifiedAdamBinary(), rel, "recorded release binary selected");
    writeFileSync(rel, Buffer.from("tampered"));
    assert.equal(verifiedAdamBinary(), null, "swapped release binary rejected");
    writeFileSync(dbg, BYTES);
    assert.equal(verifiedAdamBinary(), dbg, "local debug build trusted by provenance");
    process.env.APE_ADAM_ALLOW_UNVERIFIED = "1";
    assert.equal(verifiedAdamBinary(), rel, "explicit opt-out bypasses the check");
  } finally {
    if (prevDir === undefined) delete process.env.APE_ADAM_BIN_DIR;
    else process.env.APE_ADAM_BIN_DIR = prevDir;
    if (prevOpt === undefined) delete process.env.APE_ADAM_ALLOW_UNVERIFIED;
    else process.env.APE_ADAM_ALLOW_UNVERIFIED = prevOpt;
  }
});

test("integrity: checksum file parsing is strict", () => {
  assert.equal(parseChecksumFile(`${HEX}  adam-mcp-linux-x64\n`, "adam-mcp-linux-x64"), HEX);
  assert.equal(parseChecksumFile(`${HEX} *adam-mcp-linux-x64\n`, "adam-mcp-linux-x64"), HEX);
  assert.equal(parseChecksumFile("not-a-checksum\n", "adam-mcp-linux-x64"), null);
  assert.equal(parseChecksumFile(`${HEX}  other-asset\n`, "adam-mcp-linux-x64"), null);
  assert.deepEqual(verifyChecksum(((p) => (writeFileSync(p, BYTES), p))(join(dir, "v")) , HEX).ok, true);
});

test("integrity: present-binary CLI explicitly opts out before online proof", (t) => {
  if (!assetFor()) return t.skip("no prebuilt binary for this platform");
  const base = mkdtempSync(join(tmpdir(), "ape-adam-cli-"));
  const scripts = join(base, "scripts");
  const release = join(base, "vendors", "adam", "target", "release");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(release, { recursive: true });
  const script = join(scripts, "fetch-adam.mjs");
  copyFileSync(new URL("../scripts/fetch-adam.mjs", import.meta.url), script);
  const binary = join(release, process.platform === "win32" ? "adam-mcp.exe" : "adam-mcp");
  writeFileSync(binary, BYTES);
  const run = (opt) => spawnSync(process.execPath, [script], {
    encoding: "utf8", timeout: 5000,
    env: { ...process.env, PATH: scripts, APE_ADAM_ALLOW_UNVERIFIED: opt, APE_ADAM_SHA256: "" },
  });
  const refused = run("0");
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /no integrity proof/);
  const accepted = run("1");
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stderr, /WITHOUT integrity verification/);
  assert.deepEqual(readFileSync(binary), BYTES);
  assert.equal(existsSync(sidecarPathFor(binary)), false, "opt-out does not manufacture proof");
});
