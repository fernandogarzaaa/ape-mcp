// TUI prebuilt fetch with checksum verification. The release publishes
// `ape-tui-<platform>[.exe]` assets plus a SHA256SUMS file (see
// .github/workflows/tui-binaries.yml); this module downloads both, verifies
// the binary against the checksums, and only then writes it to disk.
// Anything missing or mismatched leaves NO file behind: the caller falls
// back to the one-time cargo build. Pure-ish and test-covered:
// tests/tui-fetch.test.js serves fixtures over localhost.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
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
    if (existsSync(dest)) return { status: "skipped", reason: "prebuilt already present" };
    const r = await fetchTui({ tag: `v${version}`, platform, isWindows, dest, fetchImpl, fetchBase });
    if (r.ok) return { status: "ready", bytes: r.bytes };
    return { status: "failed", reason: r.reason };
  } catch (e) {
    return { status: "failed", reason: String(e?.message ?? e).slice(0, 200) };
  }
}
