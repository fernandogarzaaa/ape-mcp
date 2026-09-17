// Real ADAM client: spawns the vendored adam-mcp binary (win-x64 prebuilt, cargo
// fallback via verify-adam) and drives it over line-delimited JSON-RPC stdio.
// Fallback: returns {_adam: "unavailable", ...} instead of crashing — never a silent stub.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function adamBinary() {
  const cands = [
    join(root, "vendors", "adam", "target", "release", process.platform === "win32" ? "adam-mcp.exe" : "adam-mcp"),
    join(root, "vendors", "adam", "target", "debug", process.platform === "win32" ? "adam-mcp.exe" : "adam-mcp"),
    join(root, "vendors", "adam", "bin", "adam-mcp"),
  ];
  return cands.find((p) => existsSync(p)) ?? null;
}

function dataDir() {
  const d = process.env.GODMODE_DATA_DIR || join(process.cwd(), ".godmode");
  mkdirSync(d, { recursive: true });
  return d;
}

function call(bin, tool, args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const child = spawn(bin, [], {
      stdio: ["pipe", "pipe", "inherit"],
      env: {
        ...process.env,
        ADAM_MEMORY_PATH: join(dataDir(), "adam_memory.db"),
        ADAM_GENOME_PATH: join(dataDir(), "adam_genome.json"),
        ADAM_DATA_DIR: dataDir(),
      },
    });
    let buf = "";
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; child.kill(); resolve({ _adam: "timeout", tool }); } }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      buf += c;
      let idx;
      while (!done && (idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1 && msg.result?.capabilities) { send("tools/call", { name: tool, arguments: args }, 2); continue; }
          if (msg.id === 2) {
            done = true;
            clearTimeout(timer);
            child.kill();
            resolve(msg.error
              ? { _adam: "rpc-error", tool, error: msg.error }
              : { _adam: "ok", tool, result: msg.result?.content ?? msg.result?.result ?? msg });
            continue;
          }
        } catch { /* skip non-JSON */ }
      }
    });
    child.on("error", () => { if (!done) { done = true; clearTimeout(timer); resolve({ _adam: "spawn-error", tool }); } });
    child.on("exit", () => { if (!done) { done = true; clearTimeout(timer); resolve({ _adam: "exited", tool }); } });
    function send(method, params, id = 1) {
      try { child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); } catch { /* ignore */ }
    }
    send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "godmode", version: "1.0.0" } });
  });
}

export async function adamCall(tool, args = {}, organismId = "default") {
  const bin = adamBinary();
  if (!bin) return { _adam: "unavailable", tool, hint: "run `node scripts/fetch-adam.mjs` or `cargo build --release -p adam-mcp` in vendors/adam" };
  return await call(bin, tool, { ...args, organism_id: organismId }, 60000);
}