// Fetch prebuilt adam-mcp for this platform from the APE GitHub release.
// Standalone guarantee holds: release binaries are built from vendors/adam (same repo),
// never from the source repos. Fallback: `cargo build --release -p adam-mcp` in vendors/adam.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = process.env.APE_ADAM_TAG || "v1.0.0";

export function assetFor(platform = process.platform, arch = process.arch) {
  if (platform === "win32") return "adam-mcp-win-x64.exe";
  if (platform === "darwin" && arch === "arm64") return "adam-mcp-darwin-arm64";
  if (platform === "linux" && arch === "x64") return "adam-mcp-linux-x64";
  return null;
}
export function destFor(asset) {
  return join(root, "vendors", "adam", "target", "release",
    asset.endsWith(".exe") ? "adam-mcp.exe" : "adam-mcp");
}

// Supply-chain integrity: the binary is a trusted local runtime component, so
// it is never installed unverified when an expectation exists. Expectation
// sources (first wins): APE_ADAM_SHA256 pin, then the release's <asset>.sha256
// sidecar. Mismatch deletes the file and fails closed.
//
// Trust root (explicit): TLS to github.com + the integrity of the ape-mcp
// release itself (same origin serves both bytes and checksums). There is no
// signature check: possession of the release is the trust anchor, exactly
// like the TUI fetch path. This is documented, not assumed.
// Default is FAIL-CLOSED: with no pin and no sidecar the install is refused
// (deleted) unless APE_ADAM_ALLOW_UNVERIFIED=1 explicitly opts into the old
// warn-and-install behavior. A refused install is not fatal to APE: the
// runtime reports adam-mcp explicitly unavailable (covered by tests) and
// `cargo build --release -p adam-mcp` in vendors/adam always works offline.
export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
export function parseChecksumFile(text, asset) {
  for (const line of String(text ?? "").split("\n")) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m && basename(m[2].trim()) === asset) return m[1].toLowerCase();
  }
  return null;
}
export function verifyChecksum(path, expectedHex) {
  const actual = sha256File(path);
  return { ok: actual.toLowerCase() === String(expectedHex ?? "").trim().toLowerCase(), actual };
}
export function sidecarPathFor(dest) {
  return dest + ".sha256";
}
function defaultFetch(url, dest) {
  execFileSync("curl", ["-fsSL", "-o", dest, url], { stdio: "inherit" });
  if (process.platform !== "win32") execFileSync("chmod", ["+x", dest]);
}
function defaultSidecar(url) {
  return execFileSync("curl", ["-fsSL", "--max-time", "30", url + ".sha256"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
// Install flow, factored for tests: returns a status object, never exits.
// fetchImpl(url, dest) downloads; sidecarImpl(url) returns sidecar text or throws.
// allowUnverified explicitly opts into installing without any integrity proof.
export function installAdam({ asset, dest, url, fetchImpl = defaultFetch, sidecarImpl = defaultSidecar, pin = null, allowUnverified = false }) {
  fetchImpl(url, dest);
  let expected = (pin ?? "").trim() || null;
  let via = expected ? "pin" : null;
  let sidecarTried = false;
  if (!expected) {
    try {
      const out = sidecarImpl(url);
      sidecarTried = true;
      expected = parseChecksumFile(out, asset);
      if (expected) via = "sidecar";
    } catch { /* sidecar absent — handled below */ }
  }
  const remove = () => { try { unlinkSync(dest); } catch { /* ignore */ } };
  const recordSidecar = (hex) => {
    try { mkdirSync(dirname(dest), { recursive: true }); } catch { /* ignore */ }
    try { writeFileSync(sidecarPathFor(dest), `${hex}  ${basename(dest)}\n`); } catch { /* best-effort */ }
  };
  if (expected) {
    const v = verifyChecksum(dest, expected);
    if (!v.ok) {
      remove();
      return { status: "refused", reason: "mismatch", expected, actual: v.actual, via };
    }
    recordSidecar(expected);
    return { status: "installed", verified: via, sha256: v.actual };
  }
  if (!allowUnverified) {
    remove();
    return { status: "refused", reason: "no-checksum", sidecarTried, via: null };
  }
  return { status: "installed", verified: null, warn: `no checksum sidecar${sidecarTried ? "" : " (unreachable)"} and no pin — installed WITHOUT integrity verification (explicit opt-out)` };
}
// Re-verify an already-present binary against its recorded sidecar (stale or
// swapped binaries fail instead of running). No sidecar: UNVERIFIABLE —
// presence alone proves nothing about provenance, so callers must treat it
// as untrusted (fail closed) unless the binary is a local build (see
// isLocalBuildPath) or an explicit opt-out is set.
export function verifyPresent(dest) {
  let recorded = null;
  try { recorded = parseChecksumFile(readFileSync(sidecarPathFor(dest), "utf8"), basename(dest)); } catch { /* no record */ }
  if (!recorded) return { status: "unverifiable", reason: "no-record" };
  const v = verifyChecksum(dest, recorded);
  if (!v.ok) {
    try { unlinkSync(dest); } catch { /* ignore */ }
    return { status: "refused", reason: "stale-mismatch", expected: recorded, actual: v.actual };
  }
  return { status: "present", verified: "recorded" };
}
// Local builds (cargo target/debug) are compiled from the vendored source on
// this machine: provenance is the local tree, not a download, so no recorded
// checksum is required. Release-dir binaries are held to the recorded proof.
export function isLocalBuildPath(dest) {
  return String(dest ?? "").replace(/\\/g, "/").includes("/target/debug/");
}
// Online proof for a present-but-unrecorded binary: fetch the release sidecar
// for this tag and compare. Success records the sidecar (future hits verify
// offline); anything else leaves the file untouched and reports unverifiable.
export function provePresent({ asset, dest, tag, sidecarImpl = defaultSidecar }) {
  const url = `https://github.com/fernandogarzaaa/ape-mcp/releases/download/${tag}/${asset}`;
  let text = null;
  try {
    text = sidecarImpl(url);
  } catch {
    return { status: "unverifiable", reason: "sidecar-unreachable" };
  }
  const expected = parseChecksumFile(text, asset);
  if (!expected) return { status: "unverifiable", reason: "sidecar-no-entry" };
  const v = verifyChecksum(dest, expected);
  if (!v.ok) {
    try { unlinkSync(dest); } catch { /* ignore */ }
    return { status: "refused", reason: "stale-mismatch", expected, actual: v.actual };
  }
  try { writeFileSync(sidecarPathFor(dest), `${expected}  ${basename(dest)}\n`); } catch { /* best-effort */ }
  return { status: "present", verified: "sidecar" };
}

const invokedDirectly = String(process.argv[1] || "").replace(/\\/g, "/").endsWith("scripts/fetch-adam.mjs");
if (invokedDirectly) {
  const asset = assetFor();
  const dest = asset ? destFor(asset) : null;
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify({
      platform: process.platform, arch: process.arch, tag: TAG,
      asset, present: !!(dest && existsSync(dest)),
      fallback: "cd vendors/adam && cargo build --release -p adam-mcp",
    }, null, 2));
    process.exit(asset ? 0 : 1);
  }
  if (!asset) { console.error("unsupported platform for prebuilt adam-mcp; build from vendors/adam"); process.exit(1); }
  if (existsSync(dest) && !process.argv.includes("--force")) {
    // Trust-on-first-use bootstrap for LOCAL builds: you compiled it from the
    // vendored source, so record its hash explicitly (never implied). This is
    // attestation of local provenance, not a remote integrity proof.
    if (process.argv.includes("--record-local")) {
      const v = verifyChecksum(dest, sha256File(dest));
      try { writeFileSync(sidecarPathFor(dest), `${v.actual}  ${basename(dest)}\n`); } catch { /* ignore */ }
      console.log(`recorded local build: ${dest} sha256:${v.actual.slice(0, 16)}...`);
      process.exit(0);
    }
    const v = verifyPresent(dest);
    if (v.status === "present") {
      console.log(`present: ${dest} (recorded checksum re-verified)`);
      process.exit(0);
    }
    if (v.status === "refused") {
      console.error(`present binary failed re-verification (${v.reason}); deleted. Re-run to fetch verified.`);
      process.exit(1);
    }
    // Unverifiable (no record): try an online proof before refusing, so an
    // intact release binary self-heals instead of forcing a re-download.
    const proof = provePresent({ asset, dest, tag: TAG });
    if (proof.status === "present") {
      console.log(`present: ${dest} (verified against release sidecar, recorded for next time)`);
      process.exit(0);
    }
    console.error(`present binary has no integrity proof (${proof.reason}); refusing to trust it. Re-run with --force to fetch verified, --record-local if you built it from source, or set APE_ADAM_ALLOW_UNVERIFIED=1 to override explicitly.`);
    process.exit(1);
  }
  const url = `https://github.com/fernandogarzaaa/ape-mcp/releases/download/${TAG}/${asset}`;
  mkdirSync(dirname(dest), { recursive: true });
  console.log("fetching " + url);
  try {
    const r = installAdam({
      asset, dest, url,
      pin: (process.env.APE_ADAM_SHA256 || "").trim() || null,
      allowUnverified: process.env.APE_ADAM_ALLOW_UNVERIFIED === "1",
    });
    if (r.status === "installed" && r.verified) {
      console.log(`checksum ok (${r.verified}): sha256:${r.sha256.slice(0, 16)}...`);
      console.log("installed: " + dest);
    } else if (r.status === "installed") {
      console.warn(`WARNING: ${r.warn}`);
      console.log("installed: " + dest);
    } else if (r.reason === "mismatch") {
      console.error(`checksum MISMATCH for ${asset}: expected ${r.expected}, got ${r.actual}; deleted. Refusing to install.`);
      process.exit(1);
    } else {
      console.error("no checksum available (no pin, no sidecar); deleted. Refusing to install. Set APE_ADAM_SHA256 to a pin, publish an <asset>.sha256 sidecar, or set APE_ADAM_ALLOW_UNVERIFIED=1 to override explicitly.");
      process.exit(1);
    }
  } catch {
    console.error(`fetch failed (release ${TAG} may not have binaries yet); fallback: cd vendors/adam && cargo build --release -p adam-mcp`);
    process.exit(1);
  }
}