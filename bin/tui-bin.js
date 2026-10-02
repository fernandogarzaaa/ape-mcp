#!/usr/bin/env node
// Shared ape-tui launcher: resolve the prebuilt for this platform, fall back
// to a checksum-verified release download, then to a one-time cargo build,
// then spawn it with an inherited stdio so the TUI owns the terminal. Used
// by both `ape` (bin/ape.js) and `ape-mcp tui` (bin/ape-mcp.js) — one
// resolution path.
//
// Binary provenance (no committed prebuilts): postinstall downloads the
// matching `ape-tui-<platform>[.exe]` asset from the GitHub Release for the
// installed version into vendors/ape-tui/<platform>/ (see
// .github/workflows/tui-binaries.yml); a local `cargo build --release`
// output satisfies the same path for source checkouts.
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePrebuilt } from "../scripts/tui-fetch.mjs";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function tuiPlatform() {
  return process.platform === "win32" ? "win-x64"
    : process.platform === "darwin" ? (process.arch === "arm64" ? "darwin-arm64" : "darwin-x64")
    : "linux-x64";
}

export function tuiExePath(fromRoot = root) {
  const platform = tuiPlatform();
  const exeName = process.platform === "win32" ? "ape-tui.exe" : "ape-tui";
  return join(fromRoot, "vendors", "ape-tui", platform, exeName);
}

function packageVersion(fromRoot = root) {
  try {
    return JSON.parse(readFileSync(join(fromRoot, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

function buildLocal(fromRoot = root) {
  execFileSync("cargo", ["build", "--release", "--manifest-path", join(fromRoot, "tui", "Cargo.toml")], { stdio: "inherit" });
  const built = join(fromRoot, "tui", "target", "release", process.platform === "win32" ? "ape-tui.exe" : "ape-tui");
  if (!existsSync(built)) throw new Error("cargo build produced no binary.");
  return built;
}

/// Resolve a runnable ape-tui binary: prebuilt, else checksum-verified
/// release download (pinned to v<package.json version>), else one-time
/// cargo build. Options are seams for tests: fetchImpl/fetchBase stub the
/// network, buildFn stubs cargo, log captures progress. Throws a human
/// Error only when every path fails.
export async function ensureTui({ fromRoot = root, fetchImpl = fetch, fetchBase = process.env.APE_TUI_FETCH_BASE || null, buildFn = null, log = () => {} } = {}) {
  // Dev override wins over everything (prebuilt, download, cargo): a stale
  // prebuilt can never shadow a fresh build. Documented escape hatch.
  const override = process.env.APE_TUI_BIN;
  if (override) {
    if (!existsSync(override)) throw new Error(`APE_TUI_BIN points nowhere: ${override}`);
    return override;
  }
  const dest = tuiExePath(fromRoot);
  if (existsSync(dest)) return dest;
  log("ape: no prebuilt TUI found, fetching verified release binary…");
  const r = await ensurePrebuilt({
    version: packageVersion(fromRoot),
    platform: tuiPlatform(),
    isWindows: process.platform === "win32",
    dest,
    fetchImpl,
    fetchBase,
  });
  if (r.status === "ready") {
    log(`ape: TUI prebuilt ready (${r.bytes} bytes, checksum verified).`);
    return dest;
  }
  log(`ape: ${r.reason}; trying a local cargo build…`);
  if (!existsSync(join(fromRoot, "tui", "Cargo.toml"))) {
    throw new Error(
      "no TUI prebuilt and no TUI sources in this install. " +
      "Fix one of: `npm install-scripts approve ape-mcp` then reinstall " +
      "(fetches the verified prebuilt), download ape-tui-<platform> from the " +
      "GitHub release into vendors/ape-tui/<platform>/, or run from a source " +
      "checkout with a Rust toolchain."
    );
  }
  return (buildFn ?? (() => buildLocal(fromRoot)))();
}

/// Spawn the TUI with inherited stdio. Returns the exit status.
export async function runTui(args, env = process.env, opts = {}) {
  const exe = await ensureTui(opts);
  const r = spawnSync(exe, args, { stdio: "inherit", env });
  return r.status ?? 1;
}
