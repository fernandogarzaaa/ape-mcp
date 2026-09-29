# Run sharing (Phase 3)

Share links are live links served by the originating APE server. Minting a
share for a run produces a bearer URL, `http(s)://<console>/share/<token>`,
that renders a chromeless page with exactly that run: its status, step
timeline, and receipt. Nothing else. No other runs, no console chrome, no
unrelated APIs.

Scope is single-operator: there are no user accounts. A share token is a
read-only bearer capability scoped to one run.

## Minting a share

```jsonc
// MCP tool
{ "tool": "ape_agent_share", "args": { "run_id": "ape://runs/run-9f3c", "label": "demo for review" } }
```

Response (abridged):

```json
{
  "run_id": "run-9f3c",
  "token": "4f2a...9e (64 hex chars, shown ONCE)",
  "url": "http://127.0.0.1:36189/share/4f2a...9e",
  "label": "demo for review",
  "created_at": "2026-09-29T...+08:00"
}
```

Notes:

* `run_id` accepts a bare id or the canonical `ape://runs/<id>` URI.
* The raw token is returned once and never again. Store it somewhere safe
  immediately; APE cannot re-display it.
* Unknown runs fail honestly with `run_not_found`.
* The URL's origin comes from `APE_CONSOLE_HOST` plus the console's bound
  port. The console records its bound port in `<dataDir>/console.port` on
  listen so the tool can build absolute URLs even when the console picked an
  ephemeral port; `APE_CONSOLE_PORT` pins the port explicitly and wins over
  that file. If no port is known you get `url: null` plus a hint instead of
  a broken link.

## Revoking

```jsonc
{ "tool": "ape_agent_unshare", "args": { "run_id": "ape://runs/run-9f3c", "token": "<the raw token>" } }
{ "tool": "ape_agent_unshare", "args": { "run_id": "ape://runs/run-9f3c", "all": true } }
```

Revocation timestamps the share row; it never deletes it, so the audit trail
survives. A revoked or unknown token serves HTTP 404 with no run details.

## Rotation

Tokens have no expiry. Rotate by revoking and re-minting:

1. `ape_agent_unshare` with `all: true` (kills every live link for the run),
2. `ape_agent_share` again (fresh token, fresh URL).

## The share page

`GET /share/<token>` returns a server-rendered, chromeless HTML page: status
badge, outcome, profile/model/objective, started/finished, step timeline
(step, kind, tool, duration, cost, summary), and the receipt. It carries no
console chrome and makes exactly one fetch: its own token-scoped SSE stream
at the relative URL `stream`, which triggers a page refresh when new steps
land or the run finishes. Live updates therefore work without any bearer
token and without exposing other runs.

`GET /share/<token>/stream` is that token-scoped SSE endpoint: run/status and
step events for this run only, cursor starting at "now".

The console's own SSE stream also accepts `?run_id=<id>` to filter events to
one run (behind the normal `/api/*` auth).

## Console web serving

The console binds `APE_CONSOLE_HOST` (default `127.0.0.1`). Setting it to
`0.0.0.0` is the explicit "I know what I am doing" switch for remote viewing
(another machine, a tunnel, a shared screen). `APE_CONSOLE_PORT` pins the
port; default is an ephemeral port.

`APE_CONSOLE_TOKEN`, when set, protects every `/api/*` route:
`Authorization: Bearer <token>` is required, else HTTP 401 with a Bearer
challenge. Share routes (`/share/<token>`, `/share/<token>/stream`) stay
accessible without the console bearer by design: the share token is the
bearer. When `APE_CONSOLE_TOKEN` is unset, current behavior is unchanged
(loopback-open; the pre-existing `APE_REQUIRE_AUTH`/`APE_TOKENS` gate still
applies when configured).

Binding a non-loopback host with no bearer configured prints a loud startup
warning. For anything beyond a trusted LAN, put the console behind TLS and a
real authenticating proxy; `APE_CONSOLE_TOKEN` is a shared secret, not a
login system.

## Threat model: the URL is the password

A share URL is a bearer token. Anyone who holds it can view that run for as
long as the share is live. Concretely:

* **Browser history and bookmarks** keep the full URL, token included.
  View shares in a private window on shared machines, or rotate after.
* **Server logs and proxies** may record the URL path. APE itself never logs
  raw tokens, but anything in front of it might. Prefer sharing over
  channels you trust, and revoke when done.
* **Referer leakage**: the chromeless share page makes no third-party
  requests, so the token does not leak via Referer from the page itself.
  Do not paste share URLs into sites that fetch link previews over
  redirects you do not control.
* **Scope**: a token opens exactly one run, read-only. It cannot list runs,
  call tools, or touch `/api/*`. Compromise blast radius is that run's
  timeline and receipt.
* **Storage**: the ledger keeps only the SHA-256 hash of each token, so a
  database read never yields a usable token. Presented tokens are hashed
  before lookup and hashes are compared in constant time.
* **No expiry**: links stay live until revoked. Treat every share as
  permanent until you `ape_agent_unshare` it.

## Files and schema

* `run_shares(token_hash PK, run_id, created_at, revoked_at, label)` in
  `runs.db`, created in the concurrency-safe ledger init path.
* `src/runs.js`: `shareRun`, `unshareRun`, `resolveShareToken`,
  `consoleOrigin`, `consolePortFile`.
* `src/console.js`: `/share/<token>`, `/share/<token>/stream`,
  `?run_id=` SSE filter, `APE_CONSOLE_HOST`/`APE_CONSOLE_TOKEN` handling.
* `src/server.js`: `ape_agent_share` / `ape_agent_unshare` tools plus
  `agent/share` / `agent/unshare` extension methods.
