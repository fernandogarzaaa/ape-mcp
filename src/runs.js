// Run ledger — every agent run persists here: run_id, profile, model, step records
// (tool, argsHash, durationMs, tokens, cost), stop reason, total cost.
// SQLite via node:sqlite (WAL for concurrent writer/reader between worker + server).
import { join, basename } from "node:path";
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "./sqlite.js";
import { dataDir, redactSecrets } from "./trace.js";

let db = null;
export function runsDbPath() {
  return join(dataDir(), "runs.db");
}
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch { /* ignore */ }
}
function isBusy(e) {
  return /busy|locked/i.test(String(e?.message ?? e?.errstr ?? e));
}
function open() {
  if (db) return db;
  mkdirSync(dataDir(), { recursive: true });
  let lastErr = null;
  // A forked worker may hold a write lock (WAL) while this process opens the DB
  // (e.g. server reconciling while a worker streams steps). Retry instead of
  // throwing SQLITE_BUSY on first contention.
  for (let i = 0; i < 25; i++) {
    let handle = null;
    try {
      handle = new DatabaseSync(runsDbPath());
      handle.exec("PRAGMA busy_timeout=5000");
      handle.exec("PRAGMA journal_mode=WAL");
      handle.exec("PRAGMA synchronous=NORMAL");
      handle.exec(`CREATE TABLE IF NOT EXISTS runs (
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
    finished_at TEXT,
    parent_run_id TEXT
  )`);
      handle.exec(`CREATE TABLE IF NOT EXISTS steps (
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
      handle.exec("CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id)");
      // Checkpoints: serialized loop state per run for resume (one row per run, upserted).
      handle.exec(`CREATE TABLE IF NOT EXISTS checkpoints (
    run_id TEXT PRIMARY KEY,
    step INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
      // Migration: columns added over time; ensure each exists. Parallel processes
      // (tests, server + workers) can race open() on a fresh DB, so a lost race
      // surfaces as "duplicate column" — absorbed, since the column now exists.
      // (ADD COLUMN has no IF NOT EXISTS.) Busy errors propagate to the retry loop.
      const cols = handle.prepare("PRAGMA table_info(runs)").all().map((c) => c.name);
      const ensureColumn = (name, ddl) => {
        if (cols.includes(name)) return;
        try { handle.exec(`ALTER TABLE runs ADD COLUMN ${ddl}`); }
        catch (e) { if (!/duplicate column/i.test(String(e?.message ?? e))) throw e; }
        cols.push(name);
      };
      ensureColumn("worker_pid", "worker_pid INTEGER");
      ensureColumn("model_resolution", "model_resolution TEXT");
      ensureColumn("unverified", "unverified INTEGER DEFAULT 0");
      ensureColumn("receipt", "receipt TEXT");
      ensureColumn("resumes", "resumes INTEGER DEFAULT 0");
      ensureColumn("outcome_family", "outcome_family TEXT");
      ensureColumn("outcome_hash", "outcome_hash TEXT");
      ensureColumn("profile_hash", "profile_hash TEXT");
      ensureColumn("env_hash", "env_hash TEXT");
      ensureColumn("parent_run_id", "parent_run_id TEXT");
      // Delegation audit trail: the authority restrictions the parent imposed
      // on this run at fork time (JSON, nullable). Enforcement travels via
      // the worker payload; this column is the inspectable record.
      ensureColumn("inherited_policy", "inherited_policy TEXT");
      // Phase 1 (stateful protocol): run claims. claimant is the operator
      // identity holding a live run (explicit --claim-as / APE_CLAIM_AS /
      // clientInfo fallback); claimed_at is when the claim was taken or
      // refreshed. resumed_from_step records the checkpoint step the latest
      // resume restarted from (resume is in-place; NULL when never resumed).
      ensureColumn("claimant", "claimant TEXT");
      ensureColumn("claimed_at", "claimed_at TEXT");
      ensureColumn("resumed_from_step", "resumed_from_step INTEGER");
      handle.exec("CREATE INDEX IF NOT EXISTS idx_runs_family ON runs(outcome_family)");
      // Variant deprecation: marks a family's outcome variant as dead with a reason.
      handle.exec(`CREATE TABLE IF NOT EXISTS deprecated_variants (
    family TEXT NOT NULL,
    outcome_hash TEXT NOT NULL,
    reason TEXT NOT NULL,
    deprecated_at TEXT NOT NULL,
    PRIMARY KEY (family, outcome_hash)
  )`);
      // Phase 3 (stateful protocol): run share tokens. Only the SHA-256 hash of
      // the 64-hex token is stored; the raw token is shown once at mint time and
      // never persisted or logged. revoked_at NULL means the share is live.
      handle.exec(`CREATE TABLE IF NOT EXISTS run_shares (
    token_hash TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT NULL,
    label TEXT
  )`);
      handle.exec("CREATE INDEX IF NOT EXISTS idx_run_shares_run ON run_shares(run_id)");
      db = handle;
      return db;
    } catch (e) {
      lastErr = e;
      try { handle?.close(); } catch { /* ignore */ }
      if (!isBusy(e)) throw e;
      sleepSync(200);
    }
  }
  throw lastErr;
}

export function createRun({ profile, model, objective, organism_id = "default", outcome_family = null, profile_hash = null, env_hash = null, parent_run_id = null }) {
  const d = open();
  const runId = "run-" + randomUUID().slice(0, 12);
  d.prepare("INSERT INTO runs (run_id, profile, model, objective, organism_id, outcome_family, profile_hash, env_hash, parent_run_id, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)")
    .run(runId, profile, model, objective, organism_id, outcome_family, profile_hash, env_hash, parent_run_id, new Date().toISOString());
  return runId;
}

// Atomic admission: ceiling checks AND the insert happen in one IMMEDIATE
// transaction, so concurrent admitters cannot both pass the check and
// overshoot the caps. Returns { run_id } or an honest { error } with no
// partial row (rollback). Reconcile BEFORE calling — process signaling must
// not hold the write lock. A busy ledger returns ledger_busy (retry), never
// a crash.
export function admitRun({ profile, model, objective, organism_id = "default", outcome_family = null, profile_hash = null, env_hash = null, parent_run_id = null, inherited_policy = null, maxConcurrent = 4, dailyCapUsd = 25 }) {
  const d = open();
  try {
    d.exec("BEGIN IMMEDIATE");
  } catch (e) {
    if (isBusy(e)) return { error: "ledger_busy", hint: "run ledger is locked; retry the run" };
    throw e;
  }
  try {
    const running = d.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'running'").get().n;
    if (running >= maxConcurrent) {
      d.exec("ROLLBACK");
      return { error: "too_many_runs", running, max_concurrent: maxConcurrent, hint: "wait for a run to finish or raise APE_MAX_CONCURRENT_RUNS" };
    }
    if (dailyCapUsd > 0) {
      const spent = d.prepare("SELECT COALESCE(SUM(total_cost), 0) AS s FROM runs WHERE started_at >= ?").get(new Date(Date.now() - 86400000).toISOString()).s;
      if (spent >= dailyCapUsd) {
        d.exec("ROLLBACK");
        return { error: "daily_budget_exceeded", spent_usd: spent, daily_cap_usd: dailyCapUsd, hint: "raise APE_MAX_DAILY_USD or wait for the window to roll" };
      }
    }
    const runId = "run-" + randomUUID().slice(0, 12);
    d.prepare("INSERT INTO runs (run_id, profile, model, objective, organism_id, outcome_family, profile_hash, env_hash, parent_run_id, inherited_policy, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)")
      .run(runId, profile, model, objective, organism_id, outcome_family, profile_hash, env_hash, parent_run_id, inherited_policy == null ? null : JSON.stringify(inherited_policy), new Date().toISOString());
    d.exec("COMMIT");
    return { run_id: runId };
  } catch (e) {
    try { d.exec("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  }
}

export function getRun(runId) {
  const d = open();
  const run = d.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
  if (!run) return { run_id: runId, status: "not_found", outcome_status: "not_found" };
  const steps = d.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step").all(runId);
  return {
    ...run,
    steps,
    outcome_status: outcomeStatus(run),
    // Resume lineage: resume is in-place (same run_id), so the chain is the
    // count plus the step the latest resume restarted from.
    resume_count: run.resumes ?? 0,
    resumed_from: run.resumed_from_step ?? null,
  };
}

// Lifecycle vs outcome: status says whether the run is over; outcome_status
// says what that means. Consumers (hosts, A2A) must branch on outcome_status,
// never infer success from status=done. Computed, not stored — the stop_reason
// history stays the source of truth.
export function outcomeStatus({ status, stop_reason, unverified } = {}) {
  if (status === "running") return "running";
  if (status === "not_found") return "not_found";
  if (status === "stopped") return stop_reason === "cancelled" ? "cancelled" : "stopped";
  switch (stop_reason) {
    case "explicit_final_answer": return unverified ? "unverified" : "success";
    case "dedup_reuse": return "success";
    case "no_tool_call_in_step": return "incomplete";
    case "max_steps":
    case "max_tokens":
    case "max_usd":
    case "max_wall_seconds":
    case "spend_capped":
      return "exhausted";
    default: return "failed";
  }
}

export function listRuns(limit = 20) {
  const d = open();
  return d.prepare("SELECT run_id, profile, model, status, stop_reason, step_count, total_cost, total_tokens, started_at, finished_at FROM runs ORDER BY started_at DESC LIMIT ?").all(limit);
}

// Recent runs for one profile, newest first — used by the failure-feedback loop,
// the harness analyzer, and cost-per-outcome views. Includes the receipt JSON so
// consumers can read trajectory signals (drift, evidence, fan-out) per run.
export function recentRuns(profile, limit = 10) {
  const d = open();
  return d.prepare("SELECT run_id, status, stop_reason, model, total_cost, total_tokens, step_count, unverified, receipt, started_at FROM runs WHERE profile = ? ORDER BY started_at DESC LIMIT ?").all(profile, limit);
}

export function appendStep(runId, step) {
  const d = open();
  d.prepare("INSERT INTO steps (run_id, step, kind, tool, args_hash, duration_ms, tokens, cost, result_summary, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    // Result-side text is untrusted provider/tool output: scrub credential
    // shapes before persistence. Everything downstream (status, share, SSE,
    // export) reads this row, so this is the single scrub point.
    .run(runId, step.step, step.kind ?? "model", step.tool ?? null, step.argsHash ?? null, step.durationMs ?? 0, step.tokens ?? 0, step.cost ?? 0, redactSecrets(String(step.resultSummary ?? "")).slice(0, 300), new Date().toISOString());
}

// Live totals: every streamed step also bumps the run row (cost/tokens sum
// all rows; step_count counts model turns to match max_steps semantics and
// the end-of-run absolute write, which stays numerically identical).
// Edge: halt marker rows (spend_capped/model_error) stream as kind "model"
// without a budget turn, so step_count can read one high until the absolute
// end-of-run write corrects it. Pollers (TUI meter, browser console,
// ape_agent_status) are correct mid-run instead of reading zeros.
export function recordStep(runId, step) {
  appendStep(runId, step);
  const d = open();
  d.prepare("UPDATE runs SET total_cost = total_cost + ?, total_tokens = total_tokens + ?, step_count = step_count + ? WHERE run_id = ?")
    .run(step.cost ?? 0, step.tokens ?? 0, step.kind === "model" ? 1 : 0, runId);
}

export function updateRun(runId, patch) {
  const d = open();
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const cols = keys.map((k) => `${k} = ?`).join(", ");
  d.prepare(`UPDATE runs SET ${cols} WHERE run_id = ?`).run(...keys.map((k) => patch[k]), runId);
}

// Worker-log retention: delete per-run logs for finished runs older than
// maxAgeDays. Scoped HARD to <dataDir>/workers/*.log — every candidate path
// is rebuilt as join(dir, entry-name) with separator and extension guards,
// so nothing outside that directory can be touched (proven by test).
// Missing rows count as finished (orphans); live runs are never eligible.
// Dry-run reports without deleting. Returns removal lists for logging.
export function pruneWorkerLogs({ maxAgeDays = 14, dryRun = false, nowMs = Date.now() } = {}) {
  const dir = join(dataDir(), "workers");
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return { removed: [], kept: 0, errors: [], note: "no workers dir" };
  }
  const removed = [];
  const errors = [];
  let kept = 0;
  for (const name of names) {
    const full = join(dir, name);
    // Scope guards: plain *.log filenames only. readdir cannot return
    // separators, but belt-and-braces keeps a weird filesystem honest, and
    // basename equality proves join() did not escape dir.
    if (!name.endsWith(".log") || name.includes("/") || name.includes("\\") || basename(full) !== name) {
      kept++;
      continue;
    }
    if (full !== join(dir, basename(name))) {
      kept++;
      continue;
    }
    let st;
    try {
      st = statSync(full);
    } catch (e) {
      errors.push({ file: name, error: String(e?.message ?? e).slice(0, 120) });
      continue;
    }
    if (!st.isFile()) {
      kept++;
      continue;
    }
    const ageDays = (nowMs - st.mtimeMs) / 86400000;
    if (ageDays <= maxAgeDays) {
      kept++;
      continue;
    }
    const runId = name.slice(0, -".log".length);
    let status = null;
    try {
      status = getRun(runId).status;
    } catch { /* treat lookup failure as orphan-eligible below */ }
    if (status === "running") {
      kept++;
      continue;
    }
    if (dryRun) {
      removed.push(name);
      continue;
    }
    try {
      unlinkSync(full);
      removed.push(name);
    } catch (e) {
      errors.push({ file: name, error: String(e?.message ?? e).slice(0, 120) });
    }
  }
  return { removed, kept, errors };
}
// - Live run held by someone else -> claim_conflict (409-class); only the
//   holder (or nobody, when unclaimed) may drive it.
// - Unclaimed run -> claim granted.
// - Terminal run (done/stopped/failed) -> claim is advisory: anyone may take
//   it (previous holder reported), because nothing is being driven.
// Claims never bypass admission ceilings; they only gate cancel/resume.
export function claimRun(runId, claimant) {
  const d = open();
  const run = d.prepare("SELECT run_id, status, claimant FROM runs WHERE run_id = ?").get(runId);
  if (!run) return { error: "run_not_found", run_id: runId };
  const now = new Date().toISOString();
  if (run.claimant && run.claimant !== claimant && run.status === "running") {
    return {
      error: "claim_conflict", status: 409, run_id: runId, holder: run.claimant,
      hint: "this live run is claimed by another operator; ask the holder to release it, or re-run with the holder's --claim-as name",
    };
  }
  const previous = run.claimant && run.claimant !== claimant ? run.claimant : null;
  const advisory = run.status !== "running";
  d.prepare("UPDATE runs SET claimant = ?, claimed_at = ? WHERE run_id = ?").run(claimant, now, runId);
  return { run_id: runId, claimant, claimed_at: now, advisory, previous_holder: previous };
}

// Release requires the holder's identity. Unclaimed -> no-op success.
// (Terminal-run handoff goes through claimRun's advisory overwrite, not release.)
export function releaseRun(runId, claimant) {
  const d = open();
  const run = d.prepare("SELECT run_id, status, claimant FROM runs WHERE run_id = ?").get(runId);
  if (!run) return { error: "run_not_found", run_id: runId };
  if (!run.claimant) return { run_id: runId, released: false, note: "run is not claimed" };
  if (run.claimant !== claimant) {
    return { error: "not_claim_holder", status: 403, run_id: runId, holder: run.claimant, hint: "only the holder can release a claim" };
  }
  d.prepare("UPDATE runs SET claimant = NULL, claimed_at = NULL WHERE run_id = ?").run(runId);
  return { run_id: runId, released: true, previous_holder: claimant };
}

// Phase 3 (stateful protocol): read-only share links. A share is a bearer
// capability scoped to exactly one run: whoever holds the URL can view that
// run's status, steps/timeline, and receipt — nothing else. The raw token
// (32 random bytes, 64 hex chars) is returned ONCE at mint time; only its
// SHA-256 hash is persisted, so a ledger read never leaks a usable token.
// Lookups hash the presented token first and compare hashes in constant time:
// timing reveals nothing about the 256-bit preimage.
function hashShareToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

// Console origin for share URLs. The console server records its bound port in
// <dataDir>/console.port on listen; APE_CONSOLE_PORT pins it explicitly and
// wins over the port file. Host is APE_CONSOLE_HOST (default 127.0.0.1).
// Returns null when no console port is known — callers get an honest hint
// instead of a broken link.
export function consolePortFile() {
  return join(dataDir(), "console.port");
}

export function consoleOrigin() {
  const host = process.env.APE_CONSOLE_HOST || "127.0.0.1";
  let port = null;
  const envPort = String(process.env.APE_CONSOLE_PORT || "").trim();
  if (/^\d+$/.test(envPort)) port = envPort;
  if (!port) {
    try {
      const raw = readFileSync(consolePortFile(), "utf8").trim();
      if (/^\d+$/.test(raw)) port = raw;
    } catch { /* no console has recorded a port yet */ }
  }
  return port ? `http://${host}:${port}` : null;
}

export function shareRun(runId, { label } = {}) {
  const d = open();
  const run = d.prepare("SELECT run_id FROM runs WHERE run_id = ?").get(runId);
  if (!run) return { error: "run_not_found", run_id: runId };
  const token = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const cleanLabel = typeof label === "string" && label.trim() ? label.trim().slice(0, 128) : null;
  d.prepare("INSERT INTO run_shares (token_hash, run_id, created_at, revoked_at, label) VALUES (?, ?, ?, NULL, ?)")
    .run(hashShareToken(token), runId, now, cleanLabel);
  const origin = consoleOrigin();
  return {
    run_id: runId, token, label: cleanLabel, created_at: now,
    url: origin ? `${origin}/share/${token}` : null,
    ...(origin ? {} : { hint: "console origin unknown: start the console (ape-mcp serve) or set APE_CONSOLE_PORT, then re-share" }),
  };
}

// Revoke share link(s): pass { token } to revoke one link, or { all: true } to
// revoke every live link for the run. Revocation is a timestamp, not a
// delete — audit history survives.
export function unshareRun(runId, { token, all } = {}) {
  const d = open();
  const run = d.prepare("SELECT run_id FROM runs WHERE run_id = ?").get(runId);
  if (!run) return { error: "run_not_found", run_id: runId };
  const now = new Date().toISOString();
  if (all === true) {
    const r = d.prepare("UPDATE run_shares SET revoked_at = ? WHERE run_id = ? AND revoked_at IS NULL")
      .run(now, runId);
    return { run_id: runId, revoked: r.changes };
  }
  if (typeof token === "string" && token) {
    const h = hashShareToken(token);
    const row = d.prepare("SELECT token_hash FROM run_shares WHERE run_id = ? AND token_hash = ? AND revoked_at IS NULL")
      .get(runId, h);
    if (!row) return { error: "share_not_found", run_id: runId, hint: "no live share for this run matches that token" };
    const a = Buffer.from(row.token_hash, "utf8");
    const b = Buffer.from(h, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { error: "share_not_found", run_id: runId };
    }
    d.prepare("UPDATE run_shares SET revoked_at = ? WHERE token_hash = ?").run(now, h);
    return { run_id: runId, revoked: 1 };
  }
  return { error: "missing_args", need: ["token or all=true"] };
}

// Resolve a presented share token to its live share. Returns null for
// unknown, malformed, or revoked tokens — the HTTP layer answers 404 either
// way, leaking no run details.
export function resolveShareToken(token) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  const d = open();
  const h = hashShareToken(token);
  const row = d.prepare("SELECT token_hash, run_id, created_at, label FROM run_shares WHERE token_hash = ? AND revoked_at IS NULL").get(h);
  if (!row) return null;
  const a = Buffer.from(row.token_hash, "utf8");
  const b = Buffer.from(h, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { run_id: row.run_id, created_at: row.created_at, label: row.label };
}

// Filtered run discovery for cross-client handoff: any client holding a
// run_id (or ape://runs/<id> URI) can find runs it did not start.
// updated_at is derived: finished_at for terminal runs, otherwise the last
// recorded step timestamp, otherwise started_at.
export function queryRuns({ status, profile, parent_run_id, limit = 20 } = {}) {
  const d = open();
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const conds = [];
  const params = [];
  if (status) { conds.push("runs.status = ?"); params.push(status); }
  if (profile) { conds.push("runs.profile = ?"); params.push(profile); }
  if (parent_run_id) { conds.push("runs.parent_run_id = ?"); params.push(parent_run_id); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return d.prepare(`SELECT runs.run_id, runs.profile, runs.status, runs.stop_reason, runs.unverified,
      runs.step_count, runs.total_cost, runs.started_at, runs.finished_at,
      runs.parent_run_id, runs.claimant, runs.claimed_at, runs.resumes,
      COALESCE(runs.finished_at,
        (SELECT MAX(ts) FROM steps WHERE steps.run_id = runs.run_id),
        runs.started_at) AS updated_at
    FROM runs ${where} ORDER BY runs.started_at DESC LIMIT ?`)
    .all(...params, lim)
    .map((r) => ({
      run_id: r.run_id,
      uri: `ape://runs/${r.run_id}`,
      profile: r.profile,
      status: r.status,
      outcome_status: outcomeStatus(r),
      started_at: r.started_at,
      updated_at: r.updated_at,
      claimant: r.claimant ?? null,
      claimed_at: r.claimed_at ?? null,
      step_count: r.step_count ?? 0,
      cost_usd: r.total_cost ?? 0,
      parent_run_id: r.parent_run_id ?? null,
      resume_count: r.resumes ?? 0,
    }));
}

// Dedup lookup, fail-closed: a prior run is reusable ONLY when ALL hold —
// same family + organism, finished inside the window, terminal state was a
// VERIFIED success (explicit_final_answer, not unverified, not budget/drift
// halted), identical profile hash, identical env fingerprint, identical
// resolved model. Legacy rows (NULL hashes) never match. Any missing
// requirement returns null: when in doubt, rerun.
export function findDuplicate({ family, organism_id = "default", windowSec = 3600, excludeRunId = null, profileHash = null, envHash = null, model = null }) {
  if (!family || !(windowSec > 0) || !profileHash || !envHash || !model) return null;
  const d = open();
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  return d.prepare(`SELECT run_id, status, stop_reason, step_count, total_cost, total_tokens, outcome_hash, receipt, finished_at
    FROM runs WHERE outcome_family = ? AND organism_id = ? AND status = 'done'
    AND stop_reason = 'explicit_final_answer' AND (unverified IS NULL OR unverified = 0)
    AND profile_hash = ? AND env_hash = ? AND model = ?
    AND finished_at >= ? AND run_id != COALESCE(?, '')
    ORDER BY finished_at DESC LIMIT 1`).get(family, organism_id, profileHash, envHash, model, since, excludeRunId) ?? null;
}

// Cost-per-outcome + variant tracking for one family: how many runs, what they
// cost, which outcome variants appeared, and which are deprecated.
export function familyStats(family) {
  const d = open();
  const runs = d.prepare(`SELECT run_id, status, stop_reason, step_count, total_cost, outcome_hash, started_at, finished_at
    FROM runs WHERE outcome_family = ? ORDER BY started_at`).all(family);
  const done = runs.filter((r) => r.status === "done");
  const costs = done.map((r) => r.total_cost ?? 0);
  const variants = [...new Set(done.map((r) => r.outcome_hash).filter(Boolean))];
  const deprecated = d.prepare("SELECT outcome_hash, reason, deprecated_at FROM deprecated_variants WHERE family = ?").all(family);
  const depSet = new Set(deprecated.map((x) => x.outcome_hash));
  return {
    family,
    runs: runs.length,
    completed: done.length,
    total_cost_usd: Number(costs.reduce((a, b) => a + b, 0).toFixed(6)),
    avg_cost_usd: costs.length ? Number((costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(6)) : 0,
    avg_steps: done.length ? Number((done.reduce((a, r) => a + (r.step_count ?? 0), 0) / done.length).toFixed(1)) : 0,
    variants: variants.map((h) => ({ outcome_hash: h, deprecated: depSet.has(h) })),
    deprecated,
  };
}

export function deprecateVariant({ family, outcome_hash, reason }) {
  const d = open();
  d.prepare("INSERT INTO deprecated_variants (family, outcome_hash, reason, deprecated_at) VALUES (?, ?, ?, ?) ON CONFLICT(family, outcome_hash) DO UPDATE SET reason = excluded.reason, deprecated_at = excluded.deprecated_at")
    .run(family, outcome_hash, reason, new Date().toISOString());
  return { family, outcome_hash, reason };
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

// Highest step row id (stream cursors start at "now" — no replay floods).
export function maxStepId() {
  const d = open();
  return d.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM steps").get().m;
}
// Steps newer than a row id, across all runs (powers the SSE push channel).
export function stepsSince(lastId = 0, limit = 100) {
  const d = open();
  return d.prepare("SELECT s.*, r.profile FROM steps s JOIN runs r ON r.run_id = s.run_id WHERE s.id > ? ORDER BY s.id LIMIT ?").all(lastId, limit);
}

// Total USD across runs started since the given epoch-ms (for the daily ceiling).
export function spendSince(ms) {
  const d = open();
  return d.prepare("SELECT COALESCE(SUM(total_cost), 0) AS s FROM runs WHERE started_at >= ?").get(new Date(ms).toISOString()).s;
}

export function saveCheckpoint(runId, step, state) {
  const d = open();
  d.prepare("INSERT INTO checkpoints (run_id, step, state, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET step = excluded.step, state = excluded.state, updated_at = excluded.updated_at")
    .run(runId, step, JSON.stringify(state), new Date().toISOString());
}

export function loadCheckpoint(runId) {
  const d = open();
  const row = d.prepare("SELECT * FROM checkpoints WHERE run_id = ?").get(runId);
  if (!row) return null;
  try { return { ...row, state: JSON.parse(row.state) }; }
  catch { return null; }
}

// Portable run bundles (stateful protocol, phase 2): a run's full ledger slice
// (run row, steps, checkpoint, receipt) as a versioned JSON bundle. Import
// plants it as a NEW run with lineage linked (parent_run_id + resumes chain),
// resumable via ape_agent_resume. Bundles are UNSIGNED in v1 -
// manifest.signed is always false and says so plainly; signing is a follow-up
// once key material exists. Version mismatch is a hard error, never a silent
// reinterpretation.
export const EXPORT_BUNDLE_VERSION = 1;
// Import is a trust boundary (bundles are portable execution state): hard caps
// on what one bundle may plant, so a crafted bundle cannot DB-fill the ledger
// or smuggle policy-defeating counters past the resume caps.
export const MAX_IMPORT_STEPS = Number(process.env.APE_MAX_IMPORT_STEPS ?? 2000);
function isSaneCount(n, max = 1e12) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
}
function isSaneInt(n, max = 1e9) {
  return Number.isInteger(n) && n >= 0 && n <= max;
}
// Signing extension point (H2 roadmap): v1 bundles are unsigned by design.
// verifyBundleSignature inspects bundle.manifest and reports; import accepts
// unsigned bundles as TRUSTED INPUT (documented below) but routes through
// this verifier so a future {alg, signature} plugs in without remodeling.
// A signed bundle whose signature does not verify must be REJECTED here.
export function verifyBundleSignature(bundle) {
  const manifest = bundle?.manifest;
  if (!manifest || manifest.signed !== true) {
    return { signed: false, reason: "unsigned bundle: trusted-input semantics (see importRun)" };
  }
  // No verification algorithms are registered in v1: a bundle CLAIMING to be
  // signed cannot be verified, so it is rejected rather than trusted.
  return { signed: false, reason: `unsupported signature alg: ${manifest.alg ?? "missing"}`, reject: true };
}

function exporterId() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return `ape-mcp/${pkg.version ?? "unknown"}`;
  } catch { return "ape-mcp/unknown"; }
}

function parseJsonLenient(s) {
  if (s == null) return null;
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}

// Export is read-only: any run state (live, stopped, done, failed) exports.
// worker_pid is machine-local and is always nulled in the bundle.
export function exportRun(runId) {
  const d = open();
  const run = d.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
  if (!run) return { error: "run_not_found", run_id: runId };
  const steps = d.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step").all(runId);
  const cpRow = d.prepare("SELECT * FROM checkpoints WHERE run_id = ?").get(runId);
  let checkpoint = null;
  if (cpRow) {
    const state = parseJsonLenient(cpRow.state);
    checkpoint = {
      step: cpRow.step,
      state: state && typeof state === "object" ? state : null,
      updated_at: cpRow.updated_at,
    };
    if (!checkpoint.state) checkpoint = null;
  }
  const { worker_pid, ...runRow } = run;
  return {
    version: EXPORT_BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    run: runRow,
    steps,
    checkpoint,
    receipt: parseJsonLenient(run.receipt),
    manifest: { signed: false, alg: null, signature: null, exporter: exporterId(), kind: "ape-run-export" },
  };
}

// Import: validate the bundle, then plant a NEW run row (fresh lifecycle,
// status 'stopped' so ape_agent_resume can take it), copy the step history
// with run_id remapped, and plant the checkpoint so resume continues from the
// exported loop state. The new run's parent_run_id is the exported run's id
// and resumes is the source count + 1 (the lineage's continuation count —
// APE_MAX_RESUMES applies to the lineage, same as in-place resume).
export function importRun(bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return { error: "invalid_bundle", hint: "bundle must be a JSON object produced by ape_agent_export" };
  }
  if (bundle.version !== EXPORT_BUNDLE_VERSION) {
    return {
      error: "unsupported_bundle_version",
      bundle_version: bundle.version ?? null,
      supported_version: EXPORT_BUNDLE_VERSION,
      hint: "this bundle was produced by a different ape-mcp; refusing to reinterpret it",
    };
  }
  // Signature gate: unsigned v1 bundles are accepted as trusted input (the
  // operator fetched the bundle); anything claiming a signature must verify.
  const sig = verifyBundleSignature(bundle);
  if (sig.reject) {
    return { error: "unverifiable_signature", reason: sig.reason, hint: "re-export from a supporting ape-mcp" };
  }
  const src = bundle.run;
  if (!src || typeof src !== "object" || typeof src.run_id !== "string" || !src.run_id) {
    return { error: "invalid_bundle", hint: "bundle.run is missing or has no run_id" };
  }
  // Numeric bounds: a crafted bundle must not plant negative/absurd counters
  // (policy-defeating resumes, negative spend) or unbounded history (DB-fill).
  const srcResumes = src.resumes ?? 0;
  if (!isSaneInt(srcResumes, 1e6)) {
    return { error: "invalid_bundle", field: "run.resumes", hint: "resume count must be an integer >= 0" };
  }
  const maxResumes = Number(process.env.APE_MAX_RESUMES ?? 3);
  if (srcResumes + 1 > maxResumes) {
    return { error: "resume_cap_reached", resumes: srcResumes + 1, max: maxResumes, hint: "import counts against the lineage resume cap, same as in-place resume" };
  }
  for (const [field, max] of [["step_count", 1e9], ["total_tokens", 1e12], ["total_cost", 1e9]]) {
    const v = src[field] ?? 0;
    if (!isSaneCount(v, max)) {
      return { error: "invalid_bundle", field: `run.${field}`, hint: "counter must be finite and >= 0" };
    }
  }
  const srcSteps = Array.isArray(bundle.steps) ? bundle.steps : [];
  if (srcSteps.length > MAX_IMPORT_STEPS) {
    return { error: "import_too_large", steps: srcSteps.length, max: MAX_IMPORT_STEPS, hint: "bundle history exceeds the import cap; re-export a shorter slice" };
  }
  const cpStep = bundle.checkpoint?.step ?? 0;
  if (!isSaneInt(cpStep)) {
    return { error: "invalid_bundle", field: "checkpoint.step", hint: "checkpoint step must be an integer >= 0" };
  }
  const cpState = bundle.checkpoint?.state;
  if (!cpState || typeof cpState !== "object") {
    return {
      error: "no_checkpoint",
      source_run_id: src.run_id,
      hint: "bundle has no checkpoint (source run never reached a model turn); nothing resumable to import",
    };
  }
  // Checkpoint budget/counters shape: the resumed loop trusts these numbers,
  // so they must be structurally valid (content itself is trusted input —
  // bundles are unsigned; see manifest.signed).
  const cpBudget = cpState.budget;
  if (cpBudget !== undefined) {
    if (!cpBudget || typeof cpBudget !== "object") {
      return { error: "invalid_bundle", field: "checkpoint.state.budget", hint: "budget must be an object" };
    }
    for (const f of ["steps", "tokens", "usd"]) {
      if (cpBudget[f] !== undefined && !isSaneCount(cpBudget[f])) {
        return { error: "invalid_bundle", field: `checkpoint.state.budget.${f}`, hint: "budget counters must be finite and >= 0" };
      }
    }
    if (cpBudget.started !== undefined && !(typeof cpBudget.started === "number" && Number.isFinite(cpBudget.started) && cpBudget.started >= 0)) {
      return { error: "invalid_bundle", field: "checkpoint.state.budget.started", hint: "budget start timestamp must be a finite number >= 0" };
    }
  }
  for (const [field, where] of [["destructiveUsed", "checkpoint.state.destructiveUsed"], ["compressions", "checkpoint.state.compressions"], ["parallelFanouts", "checkpoint.state.parallelFanouts"]]) {
    if (cpState[field] !== undefined && !isSaneInt(cpState[field])) {
      return { error: "invalid_bundle", field: where, hint: "counter must be an integer >= 0" };
    }
  }
  if (cpState.messages !== undefined) {
    if (!Array.isArray(cpState.messages) || cpState.messages.length > 1000) {
      return { error: "invalid_bundle", field: "checkpoint.state.messages", hint: "messages must be an array of at most 1000 entries" };
    }
    for (const m of cpState.messages) {
      if (!m || typeof m !== "object" || typeof m.role !== "string") {
        return { error: "invalid_bundle", field: "checkpoint.state.messages[]", hint: "every message must be an object with a string role" };
      }
    }
  }
  const d = open();
  const newId = "run-" + randomUUID().slice(0, 12);
  const now = new Date().toISOString();
  d.prepare(`INSERT INTO runs
    (run_id, profile, model, model_resolution, objective, organism_id, status, stop_reason,
     step_count, total_tokens, total_cost, outcome, outcome_family, outcome_hash,
     profile_hash, env_hash, unverified, receipt, parent_run_id, resumes,
     started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, 'stopped', 'imported', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      newId, src.profile ?? "unknown", src.model ?? "unknown", src.model_resolution ?? null,
      src.objective ?? "", src.organism_id ?? "default",
      src.step_count ?? 0, src.total_tokens ?? 0, src.total_cost ?? 0,
      // Imported outcome is caller-supplied result-side text: scrub like live.
      redactSecrets(typeof src.outcome === "string" ? src.outcome : JSON.stringify(src.outcome ?? null)),
      src.outcome_family ?? null, src.outcome_hash ?? null,
      src.profile_hash ?? null, src.env_hash ?? null, src.unverified ?? 0,
      typeof bundle.receipt === "string" ? bundle.receipt : JSON.stringify(bundle.receipt ?? null),
      src.run_id, (src.resumes ?? 0) + 1,
      now, now,
    );
  const insStep = d.prepare("INSERT INTO steps (run_id, step, kind, tool, args_hash, duration_ms, tokens, cost, result_summary, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const s of srcSteps) {
    if (!s || typeof s !== "object") continue;
    insStep.run(newId, s.step ?? 0, s.kind ?? null, s.tool ?? null, s.args_hash ?? null,
      s.duration_ms ?? 0, s.tokens ?? 0, s.cost ?? 0,
      // Imported history is caller-supplied: same scrub as live steps so a
      // crafted bundle cannot plant raw credentials in the ledger.
      redactSecrets(typeof s.result_summary === "string" ? s.result_summary : String(s.result_summary ?? "")),
      s.ts ?? now);
  }
  saveCheckpoint(newId, cpStep, cpState);
  const out = {
    run_id: newId,
    uri: `ape://runs/${newId}`,
    status: "stopped",
    stop_reason: "imported",
    parent_run_id: src.run_id,
    source_run_id: src.run_id,
    resume_count: (src.resumes ?? 0) + 1,
    steps_imported: srcSteps.length,
    checkpoint_step: cpStep,
    resume_with: "ape_agent_resume",
  };
  if (src.status === "running") {
    out.warning = "source run was live at export; do not resume this import while the source run is still running (the two workers would diverge from the same checkpoint)";
  }
  return out;
}