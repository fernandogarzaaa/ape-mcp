#!/usr/bin/env node
// godmode: terminal CLI that opens the browser console (CLI + observability).
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startConsole } from "../src/console.js";
import { dispatchCall } from "../src/server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);

function openBrowser(url) {
  const p = process.platform;
  try {
    if (p === "win32") execSync(`start "" "${url}"`, { shell: true });
    else if (p === "darwin") execSync(`open "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch { console.log("Open manually: " + url); }
}

if (!cmd) {
  const { port } = await startConsole({ port: 0 });
  const url = `http://127.0.0.1:${port}/`;
  console.log(`GodMode console: ${url}`);
  console.log(`MCP: stdio via 'godmode-mcp' | http via 'godmode-mcp --http 8787'`);
  openBrowser(url);
  setInterval(() => {}, 1 << 30);
} else if (cmd === "serve") {
  const noOpen = rest.includes("--no-open");
  const { port } = await startConsole({ port: 0 });
  const url = `http://127.0.0.1:${port}/`;
  console.log(url);
  if (!noOpen) openBrowser(url);
  setInterval(() => {}, 1 << 30);
} else if (cmd === "run") {
  const tool = rest[0] ?? "godmode_status";
  let args = {};
  // Accept JSON ('{...}') or robust key=value pairs (PowerShell-safe: no inner double quotes needed).
  // Accept JSON ('{...}', bash/cmd) or key=value tokens (PowerShell-safe).
  // Each argv token is parsed individually so quoted multi-word values survive intact.
  const toks = rest.slice(1);
  if (toks.length === 1 && toks[0].trim().startsWith("{")) {
    try { args = JSON.parse(toks[0]); } catch { args = {}; }
  } else if (toks.length) {
    let cur = null;
    for (const t of toks) {
      if (t === "--yes") continue;
      const eq = t.indexOf("=");
      if (eq > 0 && /^[A-Za-z_]\w*$/.test(t.slice(0, eq))) {
        cur = t.slice(0, eq);
        args[cur] = t.slice(eq + 1);
      } else if (cur) {
        args[cur] += " " + t;
      }
    }
    for (const k of Object.keys(args)) {
      const v = args[k];
      if (/^-?\d+$/.test(v)) args[k] = Number(v);
      else if (v === "true") args[k] = true;
      else if (v === "false") args[k] = false;
    }
  }
  const out = await dispatchCall(tool, args, { headlessBypass: rest.includes("--yes") });
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === "doctor") {
  const checks = [
    ["node>=20", Number(process.versions.node.split(".")[0]) >= 20],
    ["vendors/genesis", existsSync(join(root, "vendors/genesis/src/cli"))],
    ["vendors/eve", existsSync(join(root, "vendors/eve/src/cli"))],
    ["vendors/adam", existsSync(join(root, "vendors/adam/crates"))],
    ["vendors/skein", existsSync(join(root, "vendors/skein/src/skein/cli.py"))],
    ["vendors/eve-miro", existsSync(join(root, "vendors/eve-miro/src/eve_miro"))],
    ["mirofish[AGPL]", existsSync(join(root, "vendors/eve-miro/mirofish")) || existsSync(join(root, "vendors/eve-miro/mirofish.EXCLUDED"))],
    ["console.html", existsSync(join(root, "console/console.html"))],
  ];
  let fail = 0;
  for (const [n, ok] of checks) { console.log((ok ? "ok  " : "FAIL") + "  " + n); if (!ok) fail++; }
  process.exit(fail ? 1 : 0);
} else if (cmd === "mods") {
  console.log("mods: mods/policy-gates (enabled) — see godmode.config.yaml; toggle via mods/<name>/mod.json {enabled}");
} else if (cmd === "trace") {
  const out = await dispatchCall("godmode_status", {});
  console.log(JSON.stringify(out.structuredContent.result.engines, null, 2));
  console.log("trace: .godmode/trace.ndjson (GET /api/trace?since=N in console)");
} else {
  console.log("usage: godmode [serve --no-open | run <tool> [jsonArgs] [--yes] | doctor | mods | trace]");
}
