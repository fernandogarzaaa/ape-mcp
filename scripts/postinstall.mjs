// Postinstall: ensure vendored Node engines have their deps.
// Vendored node_modules are EXCLUDED from the npm package to keep it shippable;
// this installs them on first `npm install` (global or local). Idempotent and fast
// when deps already exist.
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const v of ["vendors/genesis", "vendors/eve"]) {
  const dir = join(root, v);
  if (!existsSync(join(dir, "package.json"))) continue;
  if (existsSync(join(dir, "node_modules"))) continue;
  console.log(`postinstall: installing ${v} dependencies…`);
  try {
    execFileSync("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: dir, stdio: "inherit", shell: process.platform === "win32",
    });
  } catch {
    console.error(`postinstall: ${v} install failed; run manually: npm --prefix ${v} install --ignore-scripts`);
  }
}

// TUI prebuilt: download the matching release asset (best-effort). Prebuilts
// are CI release artifacts, never committed — see .github/workflows/tui-binaries.yml.
// Failure is a warning, not an error: the launcher falls back to a one-time
// cargo build, and `ape-mcp` (non-TUI) never needs the binary.
{
  const skip = process.env.APE_SKIP_TUI_DOWNLOAD === "1";
  const plat = process.platform === "win32" ? "win-x64"
    : process.platform === "darwin" ? (process.arch === "arm64" ? "darwin-arm64" : "darwin-x64")
    : "linux-x64";
  const exe = process.platform === "win32" ? "ape-tui.exe" : "ape-tui";
  const dest = join(root, "vendors", "ape-tui", plat, exe);
  if (!skip && !existsSync(dest)) {
    let version = null;
    try {
      version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    } catch { /* fall through to warning */ }
    const asset = `ape-tui-${plat}${process.platform === "win32" ? ".exe" : ""}`;
    const url = version ? `https://github.com/fernandogarzaaa/ape-mcp/releases/download/v${version}/${asset}` : null;
    if (!url) {
      console.error("postinstall: cannot determine package version; skipping TUI download (cargo fallback at runtime).");
    } else {
      console.log(`postinstall: fetching TUI prebuilt ${asset}…`);
      try {
        const res = await fetch(url, { redirect: "follow" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mkdirSync(join(root, "vendors", "ape-tui", plat), { recursive: true });
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        if (process.platform !== "win32") chmodSync(dest, 0o755);
        console.log("postinstall: TUI prebuilt ready.");
      } catch (e) {
        console.error(`postinstall: TUI download failed (${e?.message ?? e}); 'ape' will build once via cargo, 'ape-mcp' unaffected.`);
      }
    }
  }
}