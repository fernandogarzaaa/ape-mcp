// TUI prebuilt fetch with checksum verification. The release publishes
// `ape-tui-<platform>[.exe]` assets plus a SHA256SUMS file (see
// .github/workflows/tui-binaries.yml); this module downloads both, verifies
// the binary against the checksums, and only then writes it to disk.
// Anything missing or mismatched leaves NO file behind: the caller falls
// back to the one-time cargo build. Pure-ish and test-covered:
// tests/tui-fetch.test.js serves fixtures over localhost.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const TUI_OWNER = "fernandogarzaaa";
export const TUI_REPO = "ape-mcp";

/// Release asset name for a platform dir ("win-x64" etc.).
export function assetName(platform, isWindows) {
  return `ape-tui-${platform}${isWindows ? ".exe" : ""}`;
}

/// Parse BSD/GNU sha256 lines ("<hash>  <filename>") for one asset.
export function parseSums(text, asset) {
  for (const line of String(text ?? "").split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1].replace(/^\*/, "") === asset && /^[0-9a-fA-F]{64}$/.test(parts[0])) {
      return parts[0].toLowerCase();
    }
  }
  return null;
}

function baseUrl(owner, repo, tag, fetchBase = null) {
  // fetchBase override exists for tests (localhost fixtures) only.
  if (fetchBase) return fetchBase.replace(/\/$/, "");
  return `https://github.com/${owner}/${repo}/releases/download/${tag}`;
}

/// Download + verify + write. Never leaves a partial or mismatched file:
// the destination is written only after the hash matches, and any stale
// file is removed on mismatch. Returns { ok, reason?, bytes? }.
export async function fetchTui({ owner = TUI_OWNER, repo = TUI_REPO, tag, platform, isWindows, dest, fetchImpl = fetch, fetchBase = null }) {
  const asset = assetName(platform, isWindows);
  const base = baseUrl(owner, repo, tag, fetchBase);
  let sumsRes;
  try {
    sumsRes = await fetchImpl(`${base}/SHA256SUMS`);
  } catch (e) {
    return { ok: false, reason: `checksums unreachable: ${e?.message ?? e}` };
  }
  if (!sumsRes.ok) {
    return { ok: false, reason: `checksums unavailable (HTTP ${sumsRes.status}) — not downloading ${asset}` };
  }
  const want = parseSums(await sumsRes.text(), asset);
  if (!want) {
    return { ok: false, reason: `${asset} missing from SHA256SUMS — not downloading` };
  }
  let binRes;
  try {
    binRes = await fetchImpl(`${base}/${asset}`);
  } catch (e) {
    return { ok: false, reason: `download failed: ${e?.message ?? e}` };
  }
  if (!binRes.ok) {
    return { ok: false, reason: `download failed (HTTP ${binRes.status})` };
  }
  const bytes = Buffer.from(await binRes.arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== want) {
    try { unlinkSync(dest); } catch { /* absent or already gone */ }
    return { ok: false, reason: `checksum mismatch for ${asset} (expected ${want.slice(0, 12)}…, got ${got.slice(0, 12)}…) — deleted, no file left behind` };
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  if (!isWindows) {
    try { chmodSync(dest, 0o755); } catch { /* best effort */ }
  }
  // Record what we verified, so later runs can re-verify the present file
  // offline (verify-on-hit) instead of trusting presence alone.
  try { writeFileSync(recordedSumsPath(dest), `${got}  ${asset}\n`); } catch { /* best-effort */ }
  return { ok: true, bytes: bytes.length };
}

/// Recorded-checksum sidecar for verify-on-hit. Not a trust anchor (it is
/// written by us after a verified download); it detects staleness and
/// swaps of a file we previously trusted.
export function recordedSumsPath(dest) {
  return `${dest}.sha256`;
}
export function readRecordedSums(dest) {
  // Single-line sidecar written by us after a verified download. The asset
  // name in it is informational (installed files are renamed), so accept any
  // well-formed hash line.
  try {
    const first = String(readFileSync(recordedSumsPath(dest), "utf8")).split("\n")[0].trim().split(/\s+/)[0] ?? "";
    return /^[0-9a-fA-F]{64}$/.test(first) ? first.toLowerCase() : null;
  } catch { return null; }
}
export function verifyBytes(dest, expectedHex) {
  let bytes = null;
  try {
    bytes = readFileSync(dest);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got.toLowerCase() !== String(expectedHex ?? "").trim().toLowerCase()) {
    return { ok: false, reason: "mismatch", actual: got };
  }
  return { ok: true, bytes: bytes.length };
}

/// Postinstall entry: ensure a verified prebuilt exists at dest, or explain
/// why not. NEVER throws — a crashing postinstall fails the whole
/// `npm install` for path installs (proven with a fixture), so every input
/// (missing version, fetch failure, no network) maps to a status the caller
/// logs. Returns { status: "ready"|"skipped"|"failed", reason?, bytes? }.
export async function ensurePrebuilt({ version, platform, isWindows, dest, fetchImpl = fetch, fetchBase = null }) {
  try {
    if (!version) return { status: "skipped", reason: "cannot determine package version" };
    if (existsSync(dest)) {
      // Verify-on-hit: a recorded sidecar from our own verified download
      // re-checks cheaply and offline. A swapped/stale binary is deleted so
      // the launcher falls through to a fresh fetch or cargo — never runs
      // unknown bytes. No sidecar (older installs): presence only, as before.
      const recorded = readRecordedSums(dest);
      if (!recorded) return { status: "skipped", reason: "prebuilt already present" };
      const v = verifyBytes(dest, recorded);
      if (v.ok) return { status: "ready", bytes: v.bytes, verified: "recorded" };
      try { unlinkSync(dest); } catch { /* ignore */ }
      try { unlinkSync(recordedSumsPath(dest)); } catch { /* ignore */ }
      // Fall through to a fresh verified fetch below.
    }
    const r = await fetchTui({ tag: `v${version}`, platform, isWindows, dest, fetchImpl, fetchBase });
    if (r.ok) return { status: "ready", bytes: r.bytes };
    return { status: "failed", reason: r.reason };
  } catch (e) {
    return { status: "failed", reason: String(e?.message ?? e).slice(0, 200) };
  }
}
