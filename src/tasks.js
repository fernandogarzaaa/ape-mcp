// Background tasks (MCP Tasks-extension shape, file-backed so console polling
// works across processes). Long tools run deferred; status: running -> done|failed.
// Limitation (honest): handlers execute in-process; a running tool blocks the loop
// until execFileSync returns. Polling still observes running -> done transitions.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function dir() {
  const d = process.env.GODMODE_DATA_DIR || join(process.cwd(), ".godmode");
  mkdirSync(d, { recursive: true });
  return d;
}
function path() { return join(dir(), "tasks.json"); }
function load() {
  try { return JSON.parse(readFileSync(path(), "utf8")); }
  catch { return { tasks: {} }; }
}
function save(s) { writeFileSync(path(), JSON.stringify(s, null, 2)); }

export function taskCreate(tool, args) {
  const s = load();
  const id = "task-" + randomUUID().slice(0, 8);
  s.tasks[id] = { id, tool, arguments: args, status: "running", created: new Date().toISOString(), result: null, error: null };
  save(s);
  return id;
}
export function taskGet(id) {
  const t = load().tasks[id];
  return t ?? { id, status: "not_found" };
}
export function taskList() {
  return Object.values(load().tasks).sort((a, b) => (a.created < b.created ? 1 : -1)).slice(0, 50);
}
export function taskFinish(id, result, error) {
  const s = load();
  if (!s.tasks[id]) return;
  s.tasks[id].status = error ? "failed" : "done";
  s.tasks[id].result = result ?? null;
  s.tasks[id].error = error ?? null;
  s.tasks[id].finished = new Date().toISOString();
  save(s);
}
