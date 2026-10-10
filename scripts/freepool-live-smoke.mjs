// Live smoke test for freepool against real providers (keys from env only).
// Run: node scripts/freepool-live-smoke.mjs
// With no pool key present it prints "no pool keys configured; skipping" and
// exits 0, so CI on a fork / unconfigured repo stays green.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.APE_DATA_DIR ??= mkdtempSync(join(tmpdir(), "fp-live-"));
process.chdir(process.env.APE_DATA_DIR);

const { poolMembers } = await import(new URL("../src/agent/freepool/members.js", import.meta.url).href);
const members = poolMembers();
if (!members.length) {
  console.log("no pool keys configured; skipping");
  process.exit(0);
}
console.log("pool members:", members.map((m) => `${m.provider}(${m.local ? "local" : m.keys.length + " key(s)"})`).join(", "));

const { chat } = await import(new URL("../src/agent/providers.js", import.meta.url).href);
const { freepoolStatus } = await import(new URL("../src/agent/freepool/index.js", import.meta.url).href);
const tools = [{ type: "function", function: { name: "get_time", description: "Get current time in a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }];
let failed = 0;
for (const [label, id, t] of [["plain auto", "auto", null], ["cost strategy", "cost", null], ["tool call", "auto", tools]]) {
  const s = Date.now();
  try {
    const r = await chat({ provider: "freepool", id, convKey: "live-" + label }, {
      system: "Be brief.",
      messages: [{ role: "user", content: t ? "What time is it in Manila? Use the tool." : "Reply with exactly: freepool ok" }],
      tools: t ?? undefined,
      timeoutMs: 60000,
    });
    console.log(label, `${Date.now() - s}ms`, JSON.stringify({ servedBy: r.servedBy, text: String(r.content ?? "").slice(0, 120), tools: (r.toolCalls ?? []).map((c) => c.name), attempts: r.freepool?.attempts }).slice(0, 600));
  } catch (e) {
    failed++;
    console.log(label, "ERR", String(e.message).slice(0, 600));
  }
}
console.log(JSON.stringify(freepoolStatus().members.filter((m) => m.key_present)));
process.exit(failed ? 1 : 0);
