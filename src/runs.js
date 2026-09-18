// Run ledger — every agent run persists here: run_id, profile, model, step records
// (tool, argsHash, durationMs, tokens, cost), stop reason, total cost.
// SQLite via node:sqlite (WAL for concurrent writer/reader between worker + server).
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "./sqlite.js";
import { dataDir } from "./trace.js";

let db = null;
export function runsDbPath() {
  return join(dataDir(), "runs.db");
}
function open() {
  if (db) return db;
  mkdirSync(dataDir(), { recursive: true });
  db = new DatabaseSync(runsDbPath());
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  db.exec("PRAGMA synchronous=NORMAL");
  db.exec(`CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    profile TEXT NOT NULL,
    model TEXT NOT NULL,
    objective TEXT NOT NULL,
    organism_id TEXT,
    worker_pid INTEGER,
    status TEXT NOT NULL DEFAULT 'running',
    stop_reason TEXT,
    step_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0,
    outcome TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    step INTEGER NOT NULL,
    kind TEXT,
    tool TEXT,
    args_hash TEXT,
    duration_ms INTEGER,
    tokens INTEGER DEFAULT 0,
    cost REAL DEFAULT 0,
    result_summary TEXT,
    ts TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id)");
  // Migration: worker_pid added later; ensure it exists on pre-existing databases.
  const cols = db.prepare("PRAGMA table_info(runs)").all().map((c) => c.name);
  if (!cols.includes("worker_pid")) db.exec("ALTER TABLE runs ADD COLUMN worker_pid INTEGER");
  if (!cols.includes("model_resolution")) db.exec("ALTER TABLE runs ADD COLUMN model_resolution TEXT");
  return db;
}

export function createRun({ profile, model, objective, organism_id = "default" }) {
  const d = open();
  const runId = "run-" + randomUUID().slice(0, 12);
  d.prepare("INSERT INTO runs (run_id, profile, model, objective, organism_id, status, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?)")
    .run(runId, profile, model, objective, organism_id, new Date().toISOString());
  return runId;
}

export function getRun(runId) {
  const d = open();
  const run = d.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
  if (!run) return { run_id: runId, status: "not_found" };
  const steps = d.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step").all(runId);
  return { ...run, steps };
}

export function listRuns(limit = 20) {
  const d = open();
  return d.prepare("SELECT run_id, profile, model, status, stop_reason, step_count, total_cost, total_tokens, started_at, finished_at FROM runs ORDER BY started_at DESC LIMIT ?").all(limit);
}

export function appendStep(runId, step) {
  const d = open();
  d.prepare("INSERT INTO steps (run_id, step, kind, tool, args_hash, duration_ms, tokens, cost, result_summary, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(runId, step.step, step.kind ?? "model", step.tool ?? null, step.argsHash ?? null, step.durationMs ?? 0, step.tokens ?? 0, step.cost ?? 0, String(step.resultSummary ?? "").slice(0, 300), new Date().toISOString());
}

export function updateRun(runId, patch) {
  const d = open();
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const cols = keys.map((k) => `${k} = ?`).join(", ");
  d.prepare(`UPDATE runs SET ${cols} WHERE run_id = ?`).run(...keys.map((k) => patch[k]), runId);
}

// Janitor: workers are detached forks; if one dies before updateRun() (OOM, restart),
// its row would stay "running" forever. Reconcile by checking worker PIDs.
export function reconcileRuns({ graceMs = 60000 } = {}) {
  const d = open();
  const running = d.prepare("SELECT run_id, worker_pid, started_at FROM runs WHERE status = 'running'").all();
  let fixed = 0;
  const now = Date.now();
  for (const r of running) {
    let alive = false;
    if (r.worker_pid) {
      try { process.kill(r.worker_pid, 0); alive = true; } catch { alive = false; }
    }
    const age = now - new Date(r.started_at).getTime();
    if (!alive && age > graceMs) {
      d.prepare("UPDATE runs SET status = 'stopped', stop_reason = 'worker_gone', finished_at = ? WHERE run_id = ?")
        .run(new Date().toISOString(), r.run_id);
      fixed++;
    }
  }
  return { checked: running.length, fixed };
}

export function runningCount() {
  const d = open();
  return d.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'running'").get().n;
}

// Total USD across runs started since the given epoch-ms (for the daily ceiling).
export function spendSince(ms) {
  const d = open();
  return d.prepare("SELECT COALESCE(SUM(total_cost), 0) AS s FROM runs WHERE started_at >= ?").get(new Date(ms).toISOString()).s;
}