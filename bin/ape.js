#!/usr/bin/env node
// `ape` entry: resolves the prebuilt ape-tui binary for this platform and
// spawns it (stdio/stdin inherited, so the TUI owns the terminal).
// Fallback chain: prebuilt -> `cargo run` from a source checkout -> clear
// error (never a silent downgrade). Non-TTY stdin falls through to plain
// `ape-mcp` behavior via the TUI's own guard... instead this shim refuses:
// scripted use must call `ape-mcp` directly so pipes never hang on prompts.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { root, runTui } from "./tui-bin.js";

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
try {
  process.exit(runTui(process.argv.slice(2)));
} catch {
  fail("no prebuilt TUI for this platform and cargo build failed.");
}
