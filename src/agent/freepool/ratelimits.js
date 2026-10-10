// Rate-limit signal parsing: response headers, 429 bodies, Retry-After.
// Pure functions (no I/O) so the learning rules are unit-testable.

// "2m59.56s" | "1h2m" | "850ms" | "30" | "30s" -> milliseconds (null if unparseable).
export function parseDuration(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let m;
  while ((m = re.exec(s))) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === "h" ? n * 3600000 : m[2] === "m" ? n * 60000 : m[2] === "s" ? n * 1000 : n;
  }
  return matched ? Math.round(total) : null;
}

// Retry-After: delta-seconds or an HTTP-date. Returns ms from now (>= 0) or null.
export function parseRetryAfter(v, nowMs = Date.now()) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.max(0, t - nowMs) : null;
}

function num(h, name) {
  const v = h(name);
  if (v == null || v === "") return null;
  const n = Number(String(v).split(",")[0].trim());
  return Number.isFinite(n) ? n : null;
}

// Normalize a Headers / plain object into a lowercase getter.
export function headerGetter(headers) {
  if (!headers) return () => null;
  if (typeof headers.get === "function") return (n) => headers.get(n);
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return (n) => lower[n] ?? null;
}

// Learn ceilings + exhaustion from rate-limit headers. Conventions seen in the
// wild: explicit -day / -minute suffixes (Cerebras), unsuffixed
// x-ratelimit-limit-requests meaning PER DAY (Groq) or PER MINUTE (most
// OpenAI-compatible hosts), x-ratelimit-limit-tokens = per minute.
// requestsMeaning: "day" | "minute" (catalog limits_header_requests).
export function parseRateHeaders(headers, { requestsMeaning = "minute", nowMs = Date.now() } = {}) {
  const h = headerGetter(headers);
  const limits = {};
  const rpdx = num(h, "x-ratelimit-limit-requests-day");
  const rpmx = num(h, "x-ratelimit-limit-requests-minute");
  const tpmx = num(h, "x-ratelimit-limit-tokens-minute");
  const tpdx = num(h, "x-ratelimit-limit-tokens-day");
  const req = num(h, "x-ratelimit-limit-requests") ?? num(h, "x-ratelimit-limit");
  const tok = num(h, "x-ratelimit-limit-tokens");
  if (rpdx != null) limits.rpd = rpdx;
  if (rpmx != null) limits.rpm = rpmx;
  if (tpmx != null) limits.tpm = tpmx;
  if (tpdx != null) limits.tpd = tpdx;
  if (req != null) { if (requestsMeaning === "day") limits.rpd ??= req; else limits.rpm ??= req; }
  if (tok != null) limits.tpm ??= tok;

  // Exhaustion: a remaining counter at 0 benches until its reset.
  let exhaustedUntil = null;
  let exhaustedWindow = null;
  const pairs = [
    ["x-ratelimit-remaining-requests-day", "x-ratelimit-reset-requests-day", "rpd"],
    ["x-ratelimit-remaining-tokens-day", "x-ratelimit-reset-tokens-day", "tpd"],
    ["x-ratelimit-remaining-requests-minute", "x-ratelimit-reset-requests-minute", "rpm"],
    ["x-ratelimit-remaining-tokens-minute", "x-ratelimit-reset-tokens-minute", "tpm"],
    ["x-ratelimit-remaining-requests", "x-ratelimit-reset-requests", requestsMeaning === "day" ? "rpd" : "rpm"],
    ["x-ratelimit-remaining-tokens", "x-ratelimit-reset-tokens", "tpm"],
    ["x-ratelimit-remaining", "x-ratelimit-reset", "rpm"],
  ];
  for (const [remN, resetN, win] of pairs) {
    const rem = num(h, remN);
    if (rem == null || rem > 0) continue;
    const raw = h(resetN);
    let ms = parseDuration(raw);
    // Some hosts send an absolute epoch (seconds or ms) as the reset.
    const n = Number(raw);
    if (Number.isFinite(n) && n > 1e9) ms = (n > 1e12 ? n : n * 1000) - nowMs;
    if (ms == null) ms = win.endsWith("d") ? null : 60000;
    if (ms == null) continue;
    const until = nowMs + Math.max(1000, ms);
    if (!exhaustedUntil || until > exhaustedUntil) { exhaustedUntil = until; exhaustedWindow = win; }
  }
  return { limits, exhaustedUntil, exhaustedWindow };
}

// Learn from 429 bodies such as Groq's
//   "...on requests per day (RPD): Limit 1000, Used 1000..."
//   "...tokens per minute (TPM): Limit 6000..."
export function parseLimitFromBody(text) {
  const s = String(text ?? "");
  const out = {};
  const re = /\b(RPM|RPD|TPM|TPD)\b\)?\s*:?\s*Limit:?\s*(\d+)/gi;
  let m;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = Number(m[2]);
  let window = null;
  if (/\bday\b|\bRPD\b|\bTPD\b|daily/i.test(s)) window = "day";
  else if (/per\s+minute|\bRPM\b|\bTPM\b/i.test(s)) window = "minute";
  return { limits: out, window };
}

// Failure classes drive failover vs escalation vs cooldown.
//   rate_limit   429                    -> cooldown/strike, fail over same tier
//   server       5xx                    -> short cooldown, fail over same tier
//   timeout      abort / network        -> short cooldown, fail over same tier
//   auth         401/403                -> key-wide cooldown 1h
//   not_found    404                    -> model cooldown 24h (gone from host)
//   bad_request  400/413/422            -> quality-ish: no cooldown, escalate (cost)
//   invalid      empty / unparseable output (raised by validateResponse)
export function classifyFailure(err) {
  const status = Number(err?.status ?? NaN);
  if (err?.invalid) return "invalid";
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status >= 500) return "server";
  if (status >= 400) return "bad_request";
  const msg = String(err?.message ?? err ?? "");
  if (err?.name === "AbortError" || err?.name === "TimeoutError" || /abort|timeout|timed out/i.test(msg)) return "timeout";
  return "network";
}
