#!/usr/bin/env node
// ape-mcp: stdio JSON-RPC 2.0 (dual-era surface: legacy method set + modern
// server/discover; see discover().transport for the honest wire contract)
// + --http endpoint, plus the operator CLI (serve/run/doctor/mods/trace).
// endpoint, plus the operator CLI (serve/run/doctor/mods/trace) under one bin entry.
// Stateless protocol: state travels in handles (organism_id, node, task_id, run_id).
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchCall, toolsList, discover, agentMethod, resourcesList, promptsList, readResource, getPrompt, negotiateProtocolVersion } from "../src/server.js";
import { APE_VERSION } from "../src/version.js";
import { agentCard, handleA2A } from "../src/agent/a2a.js";
import { taskGet } from "../src/tasks.js";
import { protectedResourceDoc, checkBearer, unauthorized } from "../src/auth.js";
import { startConsole } from "../src/console.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
// Operator identity for the run-claim protocol: --claim-as <name> sets
// APE_CLAIM_AS for this process (stdio server, --http, run subcommand).
// Consumed here so it never leaks into the `run` subcommand's k=v parser.
{
  const i = args.indexOf("--claim-as");
  if (i >= 0) {
    const v = args[i + 1];
    if (v && !v.startsWith("--")) process.env.APE_CLAIM_AS = v;
    args.splice(i, v && !v.startsWith("--") ? 2 : 1);
  }
}
const [cmd, ...rest] = args;
// Flags first: unknown flags must fail fast with usage (exit 2), never fall
// through to the stdio server below — that fallthrough used to hang forever
// waiting on stdin (`ape-mcp --version` was the classic victim).
const USAGE = `ape-mcp ${APE_VERSION} — agent runtime over MCP (stdio) + operator CLI
usage:
  ape-mcp [--version|--help]
  ape-mcp tui                            terminal UI (same as the ape command)
  ape-mcp [console|serve [--no-open]]      browser console (default on a TTY)
  ape-mcp --http [port]                    MCP over HTTP (default 8787)
  ape-mcp run <tool> '<json-args>'         one tool call, JSON out
  ape-mcp run <tool> k=v [...]            same, shell-friendly args
  ape-mcp doctor                           environment checks, exit 1 on FAIL
  ape-mcp templates [list|install <id>]    starter agent profiles
  ape-mcp prune [--days N] [--dry-run]  delete .ape/workers logs for finished
                                        runs older than N days (default 14)
  ape-mcp trace | mods                     engine state | mod policy gates
  ape-mcp (piped stdin)                    MCP stdio server (JSON-RPC)`;
if (cmd === "--version" || cmd === "-V" || cmd === "-v") {
  console.log(APE_VERSION);
  process.exit(0);
}
if (cmd === "--help" || cmd === "-h" || cmd === "help") {
  console.log(USAGE);
  process.exit(0);
}
if (cmd && cmd.startsWith("-") && cmd !== "--http" && cmd !== "--claim-as") {
  console.error(`unknown flag: ${cmd}\n\n${USAGE}`);
  process.exit(2);
}
// stdio is one client per process: remember its clientInfo from initialize so
// tool calls can resolve the automatic claim identity fallback.
let stdioClientInfo = null;

function openBrowser(url) {
  const p = process.platform;
  try {
    if (p === "win32") execSync(`start "" "${url}"`, { shell: true });
    else if (p === "darwin") execSync(`open "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch { console.log("Open manually: " + url); }
}

if (args.includes("--http")) {
  const port = Number(process.env.APE_PORT || args[args.indexOf("--http") + 1] || 8787);
  const host = process.env.APE_HOST || "127.0.0.1";
  const { startHttp, resolveBindConfig } = await import("../src/http.js");
  const bind = resolveBindConfig({ host });
  if (!bind.ok) {
    console.error(`refusing to serve: ${bind.error}${bind.hint ? ` (${bind.hint})` : ""}`);
    process.exit(1);
  }
  if (bind.warning) console.error(`WARNING: ${bind.warning}`);
  const started = await startHttp({ port, host: bind.host });
  console.log(`ape-mcp http on http://${started.host}:${started.port}`);
} else if (cmd === "console" || (!cmd && process.stdin.isTTY)) {
  const { port, host, token } = await startConsole({ port: 0 });
  // Bind may be 0.0.0.0 (explicit remote-viewing switch via APE_CONSOLE_HOST);
  // the browser still opens the loopback URL, which always works locally.
  // The per-session token rides in the URL once; the page strips it from the
  // address bar and sends it as Authorization: Bearer afterwards.
  const dialHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const url = `http://${dialHost}:${port}/?t=${token}`;
  console.log(`APE console: ${url}`);
  console.log(`MCP: stdio via 'ape-mcp' | http via 'ape-mcp --http 8787'`);
  openBrowser(url);
  setInterval(() => {}, 1 << 30);
} else if (cmd === "tui") {
  // Thin launcher: same binary resolution as the `ape` shim (prebuilt, else
  // one-time cargo build), with the package version passed through so the
  // TUI status line reports the real release, not the TUI crate version.
  const { runTui } = await import("./tui-bin.js");
  try {
    process.exit(await runTui(rest, { ...process.env, APE_TUI_VERSION: APE_VERSION }));
  } catch (e) {
    console.error(`ape-mcp tui: ${e?.message ?? e}`);
    process.exit(1);
  }
} else if (cmd === "serve") {
  const noOpen = rest.includes("--no-open");
  const { port, host, token } = await startConsole({ port: 0 });
  const dialHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const url = `http://${dialHost}:${port}/?t=${token}`;
  console.log(url);
  if (!noOpen) openBrowser(url);
  setInterval(() => {}, 1 << 30);
} else if (cmd === "run") {
  const tool = rest[0] ?? "ape_status";
  let a = {};
  const toks = rest.slice(1);
  if (toks.length === 1 && toks[0].trim().startsWith("{")) {
    try { a = JSON.parse(toks[0]); } catch { a = {}; }
  } else if (toks.length) {
    let cur = null;
    for (const t of toks) {
      if (t === "--yes") continue;
      const eq = t.indexOf("=");
      if (eq > 0 && /^[A-Za-z_]\w*$/.test(t.slice(0, eq))) {
        cur = t.slice(0, eq);
        a[cur] = t.slice(eq + 1);
      } else if (cur) {
        a[cur] += " " + t;
      }
    }
    for (const k of Object.keys(a)) {
      const v = a[k];
      if (/^-?\d+$/.test(v)) a[k] = Number(v);
      else if (v === "true") a[k] = true;
      else if (v === "false") a[k] = false;
    }
  }
  let out;
  try {
    out = await dispatchCall(tool, a, { headlessBypass: rest.includes("--yes") });
  } catch (e) {
    // Unknown tool is a CLI error (exit 1, stderr), not a crash dump.
    console.error(`error: ${e?.message ?? e}`);
    process.exit(1);
  }
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === "doctor") {
  const { egressHosts } = await import("../src/agent/providers.js");
  const { connectorHosts } = await import("../src/connectors.js");
  const checks = [
    ["node>=22.5", Number(process.versions.node.split(".")[0]) >= 22 && Number(process.versions.node.split(".")[1]) >= 5],
    ["node:sqlite", (await import("../src/sqlite.js")).DatabaseSync ? true : false],
    ["vendors/genesis", existsSync(join(root, "vendors/genesis/src/cli"))],
    ["vendors/eve", existsSync(join(root, "vendors/eve/src/cli"))],
    // Deps marker: written by npm only after a COMPLETE install (see postinstall).
    ["vendors/genesis deps installed", existsSync(join(root, "vendors/genesis/node_modules/.package-lock.json"))],
    ["vendors/eve deps installed", existsSync(join(root, "vendors/eve/node_modules/.package-lock.json"))],
    ["vendors/adam", existsSync(join(root, "vendors/adam/crates"))],
    ["vendors/skein", existsSync(join(root, "vendors/skein/src/skein/cli.py"))],
    ["console.html", existsSync(join(root, "console/console.html"))],
    ["console/app.js (no inline scripts)", existsSync(join(root, "console/app.js"))],
    ["console/app.css", existsSync(join(root, "console/app.css"))],
    ["console/share.js", existsSync(join(root, "console/share.js"))],
    ["console/share.css", existsSync(join(root, "console/share.css"))],
  ];
  let fail = 0;
  for (const [n, ok] of checks) { console.log((ok ? "ok  " : "FAIL") + "  " + n); if (!ok) fail++; }
  // Non-fatal: without the adam-mcp binary, memory/genome/beliefs tools
  // (ape_remember, ape_recall, ape_genome, memory.* in profiles) return
  // _adam:"unavailable". Say so here instead of letting "ok vendors/adam"
  // imply they work.
  {
    const { adamBin } = await import("../src/dispatch.js");
    if (adamBin()) console.log("ok    adam-mcp binary");
    else console.log(`warn  adam-mcp binary missing for ${process.platform}-${process.arch}: memory tools report unavailable — run \`node scripts/fetch-adam.mjs\` or \`cargo build --release -p adam-mcp\` in vendors/adam`);
  }
  // freepool: which free-tier members would serve (key presence only, never
  // the key) — informational, never a FAIL (no members is a valid setup).
  {
    const { memberInventory } = await import("../src/agent/freepool/members.js");
    const inv = memberInventory();
    const active = inv.filter((m) => m.key_present);
    console.log(`freepool members (${active.length}/${inv.length} with keys; docs/freepool.md):`);
    for (const m of inv) {
      console.log(`     ${m.key_present ? "key " : "--  "} ${m.provider.padEnd(12)} ${m.env.join("|")}${m.requires.length ? " + " + m.requires.join("+") : ""}${m.key_count > 1 ? `  (${m.key_count} keys)` : ""}${m.tos === "caution" ? "  [ToS: caution]" : ""}`);
    }
    if (process.env.APE_FREEPOOL_LOCAL_MODEL) console.log(`     key  local        APE_FREEPOOL_LOCAL_MODEL=${process.env.APE_FREEPOOL_LOCAL_MODEL}`);
  }
  console.log("egress hosts (providers + connectors):");
  for (const h of [...egressHosts(), ...connectorHosts()].sort()) console.log("     " + h);
  if (fail && checks.some(([n, ok]) => !ok && n.endsWith("deps installed"))) {
    console.log(`fix: npm --prefix "${join(root, "vendors/eve")}" install --omit=dev --ignore-scripts  (same for vendors/genesis)`);
  }
  process.exit(fail ? 1 : 0);
} else if (cmd === "mods") {
  console.log("mods: mods/policy-gates (enabled) — see ape.config.yaml; toggle via mods/<name>/mod.json {enabled}");
} else if (cmd === "trace") {
  const out = await dispatchCall("ape_status", {});
  console.log(JSON.stringify(out.structuredContent.result.engines, null, 2));
  console.log("trace: .ape/trace.ndjson (GET /api/trace?since=N in console)");
} else if (cmd === "templates") {
  const { listTemplates, installTemplate } = await import("../src/agent/templates.js");
  const [sub, id] = rest;
  if (!sub || sub === "list") {
    const all = listTemplates();
    if (!all.length) console.log("no templates (profiles/templates/ is empty or missing)");
    else {
      // Scannable rows: id + budget tier + one-line pitch. Pitches stay
      // whole (they are written short); the per-line `needs` suffix was
      // noise on every row, so it moved to the template file itself.
      console.log("starter agent profiles — install one with: ape-mcp templates install <id>");
      const width = Math.max(...all.map((t) => t.id.length));
      const tierWidth = Math.max(...all.map((t) => ((t.budget || "").split(" ")[0] || "—").length));
      for (const t of all) {
        const tier = ((t.budget || "").split(" ")[0] || "—").padEnd(tierWidth);
        const pitch = t.pitch && t.pitch.length > 96 ? t.pitch.slice(0, 95) + "…" : (t.pitch || "no pitch");
        console.log(`  ${t.id.padEnd(width)}  [${tier}]  ${pitch}`);
      }
    }
  } else if (sub === "install") {
    if (!id) {
      console.error("usage: ape-mcp templates install <id>  (see: ape-mcp templates list)");
      process.exit(2);
    }
    try {
      const name = installTemplate(id);
      console.log(`installed profile: ${name} (edit it freely — bundled templates never change)`);
    } catch (e) {
      console.error(`templates install failed: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error("usage: ape-mcp templates [list|install <id>]");
    process.exit(2);
  }
} else if (cmd === "prune") {
  const { pruneWorkerLogs } = await import("../src/runs.js");
  const di = rest.indexOf("--days");
  const days = di >= 0 ? Number(rest[di + 1]) : Number(process.env.APE_WORKER_LOG_DAYS ?? 14);
  const maxAgeDays = Number.isFinite(days) && days > 0 ? days : 14;
  const dryRun = rest.includes("--dry-run");
  const r = pruneWorkerLogs({ maxAgeDays, dryRun });
  for (const f of r.removed) console.log(`${dryRun ? "would remove" : "removed"}: ${f}`);
  console.log(`prune: ${r.removed.length} removed, ${r.kept} kept${dryRun ? " (dry run)" : ""}${r.errors.length ? `, ${r.errors.length} errors` : ""}`);
  if (r.errors.length) {
    for (const e of r.errors) console.error(`prune error: ${e.file}: ${e.error}`);
    process.exit(1);
  }
} else {
    // stdio: newline-delimited JSON-RPC {id, method, params}
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("end", () => process.exit(0));
    process.stdin.on("data", async (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const { id, method, params } = msg;
        if (id === undefined) continue; // notification — no response
        try {
          let result;
          if (method === "initialize") {
            // Negotiated version (same policy as /mcp): newest mutually
            // supported, pin on unknown. Unconditional pins break real
            // clients capped at older versions (observed: fallback to dead
            // transports after rejecting 2026-07-28).
            stdioClientInfo = params?.clientInfo ?? null;
            result = { protocolVersion: negotiateProtocolVersion(params?.protocolVersion), capabilities: discover().capabilities, serverInfo: { name: "ape-mcp", version: APE_VERSION } };
          } else if (method === "ping") {
            result = {};
          } else if (method === "server/discover") result = discover();
          else if (method === "tools/list") result = toolsList();
          else if (method === "resources/list") result = resourcesList();
          else if (method === "resources/read") result = await readResource(params?.uri);
          else if (method === "prompts/list") result = promptsList();
          else if (method === "prompts/get") result = await getPrompt(params?.name, params?.arguments ?? {});
          else if (method === "tasks/get") result = { resultType: "complete", task: taskGet(params?.task_id) };
          else if (method === "tools/call") result = await dispatchCall(params?.name, params?.arguments ?? {}, { clientInfo: stdioClientInfo });
          else if (method.startsWith("agent/")) result = await agentMethod(method, params ?? {});
          else throw { code: -32601, message: `unknown_method: ${method}` };
          process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
        } catch (e) {
          const code = typeof e?.code === "number" ? e.code : -32603;
          process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message: String(e?.message ?? e).slice(0, 300) } }) + "\n");
        }
      } catch (e) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) + "\n");
      }
    }
  });
}