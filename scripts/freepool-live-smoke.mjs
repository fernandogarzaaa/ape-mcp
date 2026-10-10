// Live smoke test for freepool against real providers (keys from env). Run: node scripts/freepool-live-smoke.mjs
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
process.chdir(mkdtempSync(join(tmpdir(),'fp-live-')));
let failed=0;
const { chat } = await import(new URL('../src/agent/providers.js', import.meta.url).href);
const tools=[{name:"get_time",description:"Get current time in a city",input_schema:{type:"object",properties:{city:{type:"string"}},required:["city"]}}];
for (const [label,id,t] of [["plain auto","auto",null],["cost strategy","cost",null],["tool call","auto",tools]]) {
  const s=Date.now();
  try {
    const r = await chat({provider:"freepool", id, convKey:"live-"+label}, {system:"Be brief.", messages:[{role:"user",content: t?"What time is it in Manila? Use the tool.":"Reply with exactly: freepool ok"}], tools:t??undefined, timeoutMs:60000});
    console.log(label, Date.now()-s+"ms", JSON.stringify({servedBy:r.servedBy, text:(r.text??r.content?.map?.(c=>c.text||c.name).join(' '))?.slice?.(0,120), tool:r.toolCalls??r.tool_calls, keys:Object.keys(r)}).slice(0,600));
  } catch(e){ failed++; console.log(label,"ERR",e.message.slice(0,600)); }
}
const { freepoolStatus } = await import(new URL('../src/agent/freepool/index.js', import.meta.url).href);
console.log(JSON.stringify(freepoolStatus().members.filter(m=>m.key_present)));
process.exit(failed?1:0);
