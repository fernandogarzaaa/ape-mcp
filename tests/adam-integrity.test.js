import test from "node:test";
import assert from "node:assert/strict";
// M8: ADAM prebuilt integrity is fail-closed by default. Valid checksum
// (pin or sidecar) installs; mismatch / missing proof refuses and deletes;
// explicit opt-out is the only unverified path. Recorded sidecars make
// present binaries re-verifiable (stale swaps fail instead of running).
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const dir = mkdtempSync(join(tmpdir(), "ape-adam-int-"));
const { installAdam, verifyPresent, parseChecksumFile, verifyChecksum, sidecarPathFor } = await import("../scripts/fetch-adam.mjs");

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

test("integrity: present binary with no record stays presence-only", () => {
  const d = dest();
  writeFileSync(d, BYTES);
  const v = verifyPresent(d);
  assert.equal(v.status, "present");
  assert.equal(v.verified, null);
});

test("integrity: checksum file parsing is strict", () => {
  assert.equal(parseChecksumFile(`${HEX}  adam-mcp-linux-x64\n`, "adam-mcp-linux-x64"), HEX);
  assert.equal(parseChecksumFile(`${HEX} *adam-mcp-linux-x64\n`, "adam-mcp-linux-x64"), HEX);
  assert.equal(parseChecksumFile("not-a-checksum\n", "adam-mcp-linux-x64"), null);
  assert.equal(parseChecksumFile(`${HEX}  other-asset\n`, "adam-mcp-linux-x64"), null);
  assert.deepEqual(verifyChecksum(((p) => (writeFileSync(p, BYTES), p))(join(dir, "v")) , HEX).ok, true);
});
