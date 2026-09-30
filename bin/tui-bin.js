#!/usr/bin/env node
// Shared ape-tui launcher: resolve the prebuilt for this platform, fall back
// to a one-time cargo build from a source checkout, then spawn it with an
// inherited stdio so the TUI owns the terminal. Used by both `ape`
// (bin/ape.js) and `ape-mcp tui` (bin/ape-mcp.js) — one resolution path.
//
// Binary provenance (no committed prebuilts): postinstall downloads the
// matching `ape-tui-<platform>[.exe]` asset from the GitHub Release for the
// installed version into vendors/ape-tui/<platform>/ (see
// .github/workflows/tui-binaries.yml); a local `cargo build --release`
// output satisfies the same path for source checkouts.
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function tuiExePath() {
  const platform = process.platform === "win32" ? "win-x64"
    : process.platform === "darwin" ? (process.arch === "arm64" ? "darwin-arm64" : "darwin-x64")
    : "linux-x64";
  const exeName = process.platform === "win32" ? "ape-tui.exe" : "ape-tui";
  return join(root, "vendors", "ape-tui", platform, exeName);
}

/// Resolve a runnable ape-tui binary: prebuilt, else build once via cargo.
/// Throws an Error with a human message when neither works.
export function ensureTui() {
  const prebuilt = tuiExePath();
  if (existsSync(prebuilt)) return prebuilt;
  execFileSync("cargo", ["build", "--release", "--manifest-path", join(root, "tui", "Cargo.toml")], { stdio: "inherit" });
  const built = join(root, "tui", "target", "release", process.platform === "win32" ? "ape-tui.exe" : "ape-tui");
  if (!existsSync(built)) throw new Error("cargo build produced no binary.");
  return built;
}

/// Spawn the TUI with inherited stdio. Returns the exit status.
export function runTui(args, env = process.env) {
  const exe = ensureTui();
  const r = spawnSync(exe, args, { stdio: "inherit", env });
  return r.status ?? 1;
}
