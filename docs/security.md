# Security model

## Network egress — closed by default

APE makes **no** outbound connection at runtime except two explicitly configured paths:

1. **Model providers** — declared in a profile (`anthropic`, `openai`, `openrouter`,
   `local`). Listed in `ape-mcp doctor` under "egress hosts".
2. **Connectors** — every connector declares `egress_allow`; requests to other hosts are
   refused (`egress_denied`) and traced.

Everything else is vendored and pinned in `vendors/manifest.yaml`. No runtime
`git clone`, no `npx -y <other-repo>`. Verified by the self-containment gate.

## Secrets

- Credentials are resolved at run time from **environment variables or the host platform's
  own credential store** (OpenCode `auth.json`, Claude `.credentials.json`, Codex
  `auth.json`) — never hardcoded, never written to APE state.
- **Key material never leaves the worker's memory.** It is not stored in the run ledger,
  not echoed in `ape_status` / `ape_agent_profiles` / tool responses (only provider +
  model + `resolution` are surfaced), and never logged. Verified by tests.
- Host credential stores are read with **readOnly** access; APE never modifies them.
- `ape-mcp doctor` prints hosts, never tokens.

## Destructive operations — MRTR confirm + loop policy

Tools and connector ops annotated `destructive: true` return `input_required` unless
explicitly confirmed. Inside an agent loop (which cannot answer elicitations):

- Default profile policy **denies** unattended destructive calls (`ape_evolve`
  accept/apply, destructive connector ops). The model gets an honest
  `destructive_not_allowed` error telling it to finish with a proposal instead.
- Profiles may set `policy: { destructive: allow }`, still capped by
  `limits.max_destructive` (default 1) per run.
- **Every** destructive attempt (denied, capped, or executed) is written to the
  prominent `agent.destructive` audit stream (trace + `ledger.jsonl`).

## Auth (local-first)

- MCP surface: opt-in bearer enforcement (`APE_REQUIRE_AUTH=1
  APE_TOKENS=<csv>`, open on loopback by default, v1). RFC 9728 well-known
  document at `GET /.well-known/oauth-protected-resource`.
- Console surface (`src/console.js`): **always authenticated**. At startup the
  server mints a per-session token (or uses `APE_CONSOLE_TOKEN` when set);
  every `/api/*` route — read and write — requires it as
  `Authorization: Bearer`, else 401. The CLI opens `/?t=<token>`; the page
  strips it from the address bar and keeps it in memory only. Share routes
  keep their own token-scoped capability and stay bearer-free by design.
- Future IdP: `APE_AUTH_SERVERS='["https://idp.example.com"]'`.

## Console web security (O1)

Threat: the console renders connector responses, profile/connector names,
and run data that are attacker-influenced. Defenses, all tested in
`tests/console-security.test.js` with hostile fixtures:

- **No HTML-string rendering**: `console/app.js` builds every row with
  `textContent`/`createElement`; actions ride `data-*` attributes with
  delegated listeners. No `innerHTML`, no inline `onclick`. The server
  preserves API payloads byte-for-byte (so exports stay faithful); escaping
  happens at render. The share page was already escaped and is pinned by a
  guard test; the run export (`ape_agent_export`) is JSON, not HTML.
- **Strict CSP + headers on every console response** (shell, assets, API,
  share, streams): `default-src 'none'; script-src 'self'; style-src
  'self'; connect-src 'self'; …; frame-ancestors 'none'`, plus
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `X-Frame-Options: DENY`. Inline scripts/styles were externalized to
  `/app.js`, `/app.css`, `/share.js`, `/share.css`.
- **Host allowlist on the console** (same `APE_ALLOWED_HOSTS` mechanism as
  `/mcp`): only the bound loopback address, `localhost`, or an explicitly
  listed host is answered; anything else gets 403 before auth or dispatch.
  This is the DNS-rebinding guard — Origin-vs-Host comparison alone passes
  under rebinding, and Origin-less requests skip CORS entirely.
- Remote viewing (`APE_CONSOLE_HOST=0.0.0.0`) now *requires*
  `APE_ALLOWED_HOSTS` to answer non-loopback Host values; the session
  bearer still gates `/api/*`.
- Browser-only residual (cannot be proven by tests): that injected markup
  truly never executes and CSP blocks as configured — confirm with devtools
  (blocked-inline-script messages, no alert) on first run.

## Open decisions (operator input required — not built)

- **Destructive confirm gate**: today a `confirm: true` argument passes the
  gate, which any same-origin script can also pass. Options and costs:
  1. *Separate operator-approval endpoint with its own token* — medium
     work (new route + token plumbing + CLI display); token must reach the
     human out-of-band or it is theater.
  2. *TTY/TUI confirmation* — small work, strongest phishing resistance
     (the browser cannot click a terminal), but blocks headless/API use.
  3. *Single-use approval ids* (elicitation → id → call) — medium work;
     narrows replay but a same-origin script can still complete the flow.
  None chosen yet — awaiting operator decision.
- **`ape_test_provider` via `/api/call`**: each call is one real,
  billable model call with only bearer auth. Per-caller rate-limit options
  (all reuse the existing `checkRateLimit` core from `src/http.js`):
  1. *Per-tool per-IP bucket* (e.g. 10/min for `ape_test_provider`,
     `ape_agent_run`) — small work, shared-state Map like `/mcp`.
  2. *Authenticated-caller buckets* (per token) — small work once tokens
     are per-operator; today there is one shared token, so equals global.
  3. *Spend-denominated cap* (max test-call USD/hour) — medium work,
     strongest cost coupling. Reporting only — not built.

## Remote surface (`/mcp` + HTTP server)

Applies when APE listens beyond loopback (see `docs/remote.md`,
`docs/aws-deployment.md`, `docs/threat-model.md`):

- **Fail-closed bind**: non-loopback refuses to start without bearer auth
  (`resolveBindConfig`); `APE_ALLOW_OPEN_REMOTE=1` override is reckless-only.
- **Bearer on every `/mcp` verb**, compared constant-time; 401 executes
  nothing. Single shared bearer (no per-tool/per-client identity yet).
- **Host allowlist** (`APE_ALLOWED_HOSTS`, port-insensitive, exact match):
  DNS-rebinding defense at the app layer behind Caddy's edge enforcement.
- **CORS**: exact-origin allowlist (`APE_CORS_ORIGIN`) + explicit preflight;
  never wildcard, nothing by default.
- **SSRF net** (connectors): loopback/link-local/RFC1918/multicast/unspecified
  refused pre-fetch, including decimal/octal/hex IP spellings and redirect
  targets (DNS answers checked); `APE_ALLOW_PRIVATE_EGRESS=1` opts out for
  local dev. Residual DNS-rebinding TOCTOU documented.
- **Rate limiting**: fixed-window per IP on `/mcp` (`APE_RATE_LIMIT_RPM`
  default 240/min, `Retry-After` on 429); checked before auth.
- **Sizes/timeouts**: 4 MB `/mcp` bodies, connector timeouts, provider
  wall-time abort, budget halts.
- **Sessions**: random UUIDs, 30-min idle expiry, DELETE invalidation;
  restart drops them (documented, single-node).

## Cost

The **budget governor** (`max_usd`, `max_steps`, `max_tokens`, `max_wall_seconds`) is the
only thing between a misconfigured agent loop and an unbounded bill. It is checked after
every model call and every tool call, and each limit halts the loop independently. Not
optional polish.

Above a single run: `APE_MAX_CONCURRENT_RUNS` (default 4) caps forked workers, and
`APE_MAX_DAILY_USD` (default 25) caps total spend per rolling 24h — both refuse new runs
with honest errors. Stale `running` rows (dead workers) reconcile to `worker_gone` on
status/run calls, preserving the partial ledger. Identical repeated calls halt with
`repetition_detected` instead of burning budget.

## Mods

Mods run in-process with full access — the code-level trust boundary. Connectors are the
declarative, sandboxed alternative. See `mods.md`.

## License

All vendored engines are MIT. APE ships **no AGPL component**; the license gate fails CI
if any AGPL text appears in `vendors/`.