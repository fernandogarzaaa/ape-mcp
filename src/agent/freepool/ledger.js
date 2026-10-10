// freepool rate ledger: per (provider, model, key-hash) request/token
// counters, learned ceilings, cooldowns, and health — persisted in
// <dataDir>/freepool.db (node:sqlite). Raw keys NEVER reach this file: every
// row is keyed by keyHash() (truncated SHA-256), and last-error text is
// scrubbed with redactSecrets before it is stored.
//
// Windows: RPM/TPM are sliding 60s; RPD/TPD reset at UTC midnight (providers
// reset on the calendar day, not a rolling 24h). Usage rows older than the
// current UTC day (minus one minute, so a minute window straddling midnight
// stays exact) are pruned.
import { createHash } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "../../sqlite.js";
import { dataDir, ensureDataDir, redactSecrets } from "../../trace.js";

const DAY_MS = 86400000;
let nowFn = () => Date.now();
// Test seam: deterministic clock for window/reset/cooldown tests.
export function _setClock(fn) { nowFn = fn ?? (() => Date.now()); }
export function now() { return nowFn(); }
export function utcDayStart(ms = now()) { return Math.floor(ms / DAY_MS) * DAY_MS; }
export function nextUtcMidnight(ms = now()) { return utcDayStart(ms) + DAY_MS; }

export function keyHash(key) {
  if (key == null) return "nokey";
  return createHash("sha256").update(String(key)).digest("hex").slice(0, 16);
}

let db = null;
let dbPath = null;
export function ledgerPath() { return join(dataDir(), "freepool.db"); }
function open() {
  const p = ledgerPath();
  if (db && dbPath === p) return db;
  try { db?.close(); } catch { /* ignore */ }
  ensureDataDir();
  db = new DatabaseSync(p);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=2000;
    CREATE TABLE IF NOT EXISTS fp_usage (provider TEXT NOT NULL, model TEXT NOT NULL, key_hash TEXT NOT NULL, ts INTEGER NOT NULL, tokens INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS fp_usage_k ON fp_usage(provider, key_hash, model, ts);
    CREATE TABLE IF NOT EXISTS fp_limits (provider TEXT NOT NULL, model TEXT NOT NULL, key_hash TEXT NOT NULL, rpm INTEGER, rpd INTEGER, tpm INTEGER, tpd INTEGER, source TEXT, updated INTEGER, PRIMARY KEY (provider, model, key_hash));
    CREATE TABLE IF NOT EXISTS fp_state (provider TEXT NOT NULL, model TEXT NOT NULL, key_hash TEXT NOT NULL, cooldown_until INTEGER NOT NULL DEFAULT 0, cooldown_reason TEXT, strikes INTEGER NOT NULL DEFAULT 0, strike_window INTEGER NOT NULL DEFAULT 0, successes INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER, last_error TEXT, last_error_at INTEGER, PRIMARY KEY (provider, model, key_hash));
  `);
  dbPath = p;
  return db;
}
// Test seam: drop the cached handle (e.g. after deleting the file).
export function _closeLedger() { try { db?.close(); } catch { /* ignore */ } db = null; dbPath = null; }

let lastPrune = 0;
function prune(d) {
  const t = now();
  if (t - lastPrune < 60000 && lastPrune <= t) return;
  lastPrune = t;
  d.prepare("DELETE FROM fp_usage WHERE ts < ?").run(utcDayStart(t) - 60000);
}

export function recordUsage(provider, model, kh, tokens = 0) {
  const d = open();
  d.prepare("INSERT INTO fp_usage (provider, model, key_hash, ts, tokens) VALUES (?, ?, ?, ?, ?)").run(provider, model, kh, now(), Math.max(0, Math.round(tokens || 0)));
  prune(d);
}

// Usage for one model+key (model="*" sums across the key's models: account pools).
export function usage(provider, model, kh) {
  const d = open();
  const t = now();
  const minute = t - 60000;
  const day = utcDayStart(t);
  const where = model === "*" ? "provider = ? AND key_hash = ?" : "provider = ? AND key_hash = ? AND model = ?";
  const args = model === "*" ? [provider, kh] : [provider, kh, model];
  const m = d.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(tokens),0) AS t FROM fp_usage WHERE ${where} AND ts > ?`).get(...args, minute);
  const dd = d.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(tokens),0) AS t FROM fp_usage WHERE ${where} AND ts >= ?`).get(...args, day);
  return { rpm: Number(m.n), tpm: Number(m.t), rpd: Number(dd.n), tpd: Number(dd.t) };
}

export function learnedLimits(provider, model, kh) {
  const r = open().prepare("SELECT rpm, rpd, tpm, tpd, source, updated FROM fp_limits WHERE provider = ? AND model = ? AND key_hash = ?").get(provider, model, kh);
  return r ? { rpm: r.rpm, rpd: r.rpd, tpm: r.tpm, tpd: r.tpd, source: r.source, updated: r.updated } : null;
}

// Merge newly learned ceilings (only finite positive numbers overwrite).
export function learnLimits(provider, model, kh, lim, source = "headers") {
  const cur = learnedLimits(provider, model, kh) ?? {};
  const next = {};
  let changed = false;
  for (const k of ["rpm", "rpd", "tpm", "tpd"]) {
    const v = Number(lim?.[k]);
    if (Number.isFinite(v) && v > 0) { next[k] = Math.round(v); if (next[k] !== cur[k]) changed = true; }
    else next[k] = cur[k] ?? null;
  }
  if (!changed) return cur;
  open().prepare(`INSERT INTO fp_limits (provider, model, key_hash, rpm, rpd, tpm, tpd, source, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, model, key_hash) DO UPDATE SET rpm=excluded.rpm, rpd=excluded.rpd, tpm=excluded.tpm, tpd=excluded.tpd, source=excluded.source, updated=excluded.updated`)
    .run(provider, model, kh, next.rpm, next.rpd, next.tpm, next.tpd, source, now());
  return next;
}

// Effective limits: learned ceilings win over the catalog snapshot.
export function effectiveLimits(provider, model, kh, catalogLimits = {}) {
  const l = learnedLimits(provider, model, kh) ?? {};
  const out = {};
  for (const k of ["rpm", "rpd", "tpm", "tpd"]) {
    const v = l[k] ?? catalogLimits?.[k] ?? null;
    out[k] = v == null ? null : Number(v);
  }
  return out;
}

function getState(provider, model, kh) {
  return open().prepare("SELECT * FROM fp_state WHERE provider = ? AND model = ? AND key_hash = ?").get(provider, model, kh) ?? null;
}
function upsertState(provider, model, kh, patch) {
  const cur = getState(provider, model, kh) ?? { cooldown_until: 0, cooldown_reason: null, strikes: 0, strike_window: 0, successes: 0, failures: 0, latency_ms: null, last_error: null, last_error_at: null };
  const s = { ...cur, ...patch };
  open().prepare(`INSERT INTO fp_state (provider, model, key_hash, cooldown_until, cooldown_reason, strikes, strike_window, successes, failures, latency_ms, last_error, last_error_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, model, key_hash) DO UPDATE SET cooldown_until=excluded.cooldown_until, cooldown_reason=excluded.cooldown_reason, strikes=excluded.strikes, strike_window=excluded.strike_window, successes=excluded.successes, failures=excluded.failures, latency_ms=excluded.latency_ms, last_error=excluded.last_error, last_error_at=excluded.last_error_at`)
    .run(provider, model, kh, s.cooldown_until, s.cooldown_reason, s.strikes, s.strike_window, s.successes, s.failures, s.latency_ms, s.last_error, s.last_error_at);
  return s;
}

export function health(provider, model, kh) {
  const s = getState(provider, model, kh);
  return { successes: s?.successes ?? 0, failures: s?.failures ?? 0, latencyMs: s?.latency_ms ?? null, lastError: s?.last_error ?? null, lastErrorAt: s?.last_error_at ?? null };
}

// Cooldown that applies to this model+key: its own, or a key-wide one (model "*").
export function cooldown(provider, model, kh) {
  const t = now();
  let best = null;
  for (const m of [model, "*"]) {
    const s = getState(provider, m, kh);
    if (s && s.cooldown_until > t && (!best || s.cooldown_until > best.until)) best = { until: s.cooldown_until, reason: s.cooldown_reason, scope: m === "*" ? "key" : "model" };
  }
  return best;
}

export function setCooldown(provider, model, kh, untilMs, reason) {
  const cur = getState(provider, model, kh);
  // Never shorten an existing (e.g. authoritative) bench.
  const until = Math.max(untilMs, cur?.cooldown_until ?? 0);
  upsertState(provider, model, kh, { cooldown_until: until, cooldown_reason: reason });
  return until;
}

// Escalation ladder for repeated 429s within 24h: 1 min, 10 min, 1 h, then
// until the next UTC midnight (daily quota is the likely wall by then).
export const STRIKE_LADDER_MS = [60000, 600000, 3600000];
export function strike(provider, model, kh) {
  const t = now();
  const cur = getState(provider, model, kh);
  const fresh = !cur || t - (cur.strike_window ?? 0) > DAY_MS;
  const strikes = (fresh ? 0 : cur.strikes) + 1;
  upsertState(provider, model, kh, { strikes, strike_window: fresh ? t : cur.strike_window });
  const dur = strikes <= STRIKE_LADDER_MS.length ? STRIKE_LADDER_MS[strikes - 1] : nextUtcMidnight(t) - t;
  return { strikes, untilMs: t + dur };
}

export function recordSuccess(provider, model, kh, latencyMs) {
  const s = getState(provider, model, kh);
  const lat = s?.latency_ms == null ? latencyMs : Math.round(s.latency_ms * 0.7 + latencyMs * 0.3);
  upsertState(provider, model, kh, { successes: (s?.successes ?? 0) + 1, latency_ms: lat });
}

export function recordFailure(provider, model, kh, message) {
  const s = getState(provider, model, kh);
  upsertState(provider, model, kh, {
    failures: (s?.failures ?? 0) + 1,
    last_error: redactSecrets(String(message ?? "")).slice(0, 200),
    last_error_at: now(),
  });
}

// Read-only dump for status surfaces (no secrets exist in the DB to leak).
export function snapshot() {
  const d = open();
  return {
    state: d.prepare("SELECT provider, model, key_hash, cooldown_until, cooldown_reason, strikes, successes, failures, latency_ms, last_error, last_error_at FROM fp_state").all(),
    limits: d.prepare("SELECT provider, model, key_hash, rpm, rpd, tpm, tpd, source, updated FROM fp_limits").all(),
  };
}
