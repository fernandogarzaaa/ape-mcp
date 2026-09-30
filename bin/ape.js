#!/usr/bin/env node
// `ape` entry: resolves the prebuilt ape-tui binary for this platform and
// spawns it (stdio/stdin inherited, so the TUI owns the terminal).
// Fallback chain lives in tui-bin.js: prebuilt -> verified release download
// -> one-time cargo build (source checkouts only) -> clear error naming the
// remedy (never a silent downgrade). Non-TTY stdin falls through to plain
// `ape-mcp` behavior via the TUI's own guard... instead this shim refuses:
// scripted use must call `ape-mcp` directly so pipes never hang on prompts.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root, runTui } from "./tui-bin.js";

function fail(msg) {
  console.error(`ape: ${msg}`);
  process.exit(1);
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
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
  // Same version passthrough as `ape-mcp tui`: the status line reports the
  // release on every launch path, never the crate fallback.
  const v = packageVersion();
  const env = v ? { ...process.env, APE_TUI_VERSION: v } : undefined;
  process.exit(await runTui(process.argv.slice(2), env));
} catch (e) {
  // ensureTui already names the exact remedy (approve scripts, release
  // download, or source checkout); surface it instead of a generic hint.
  fail(e?.message ?? "no prebuilt TUI for this platform and cargo build failed.");
}
