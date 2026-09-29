#!/usr/bin/env node
// `ape` entry: resolves the prebuilt ape-tui binary for this platform and
// spawns it (stdio/stdin inherited, so the TUI owns the terminal).
// Fallback chain: prebuilt -> `cargo run` from a source checkout -> clear
// error (never a silent downgrade). Non-TTY stdin falls through to plain
// `ape-mcp` behavior via the TUI's own guard... instead this shim refuses:
// scripted use must call `ape-mcp` directly so pipes never hang on prompts.
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.platform === "win32" ? "win-x64"
  : process.platform === "darwin" ? (process.arch === "arm64" ? "darwin-arm64" : "darwin-x64")
  : "linux-x64";
const exeName = process.platform === "win32" ? "ape-tui.exe" : "ape-tui";
const prebuilt = join(root, "vendors", "ape-tui", platform, exeName);

function fail(msg) {
  console.error(`ape: ${msg}`);
  console.error("hint: run `ape-mcp` directly for scripted use, or build the TUI with `cargo build --release -p ape-tui` in tui/.");
  process.exit(1);
}

if (!process.stdin.isTTY && process.argv.length <= 2) {
  fail("not a terminal — refusing interactive start (use `ape-mcp` for pipes and scripts).");
}
// With arguments, `ape` is exactly `ape-mcp` (one code path, no behavior
// fork): `ape run ...`, `ape --http ...`, `ape doctor`, ... — including from
// pipes and scripts, since argument mode never prompts.
if (process.argv.length > 2) {
  const r = spawnSync(process.execPath, [join(root, "bin", "ape-mcp.js"), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
if (existsSync(prebuilt)) {
  const r = spawnSync(prebuilt, process.argv.slice(2), { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
// Source checkout fallback: build once via cargo if available.
try {
  execFileSync("cargo", ["build", "--release", "--manifest-path", join(root, "tui", "Cargo.toml")], { stdio: "inherit" });
} catch {
  fail("no prebuilt TUI for this platform and cargo build failed.");
}
const built = join(root, "tui", "target", "release", exeName);
if (!existsSync(built)) fail("cargo build produced no binary.");
const r = spawnSync(built, process.argv.slice(2), { stdio: "inherit" });
process.exit(r.status ?? 1);
