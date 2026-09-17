// Fetch prebuilt adam-mcp for this platform from the godmode GitHub release.
// Standalone guarantee holds: release binaries are built from vendors/adam (same repo),
// never from the 5 source repos. Fallback: `cargo build --release -p adam-mcp` in vendors/adam.
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = process.env.GODMODE_ADAM_TAG || "v1.2.0";

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

const invokedDirectly = String(process.argv[1] || "").replace(/\\/g, "/").endsWith("scripts/fetch-adam.mjs");
if (invokedDirectly && process.argv.includes("--check")) {
if (invokedDirectly) {
const asset = assetFor();
  const dest = asset ? destFor(asset) : null;
  console.log(JSON.stringify({
    platform: process.platform, arch: process.arch, tag: TAG,
    asset, present: !!(dest && existsSync(dest)),
    fallback: "cd vendors/adam && cargo build --release -p adam-mcp",
  }, null, 2));
  process.exit(asset ? 0 : 1);
}

const asset = assetFor();
if (!asset) { console.error("unsupported platform for prebuilt adam-mcp; build from vendors/adam"); process.exit(1); }
const dest = destFor(asset);
if (existsSync(dest) && !process.argv.includes("--force")) { console.log("present: " + dest); process.exit(0); }
const url = `https://github.com/fernandogarzaaa/godmode/releases/download/${TAG}/${asset}`;
mkdirSync(dirname(dest), { recursive: true });
console.log("fetching " + url);
try {
  execFileSync("curl", ["-fsSL", "-o", dest, url], { stdio: "inherit" });
  if (process.platform !== "win32") execFileSync("chmod", ["+x", dest]);
  console.log("installed: " + dest);
} catch {
  console.error(`fetch failed (release ${TAG} may not have binaries yet); fallback: cd vendors/adam && cargo build --release -p adam-mcp`);
  process.exit(1);
}
}
