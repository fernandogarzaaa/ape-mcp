# APE security invariants (non-negotiable)

These properties are enforced by code and pinned by regression tests. A change
that breaks one is a vulnerability, not a refactor. Each names its enforcement
point and its test file.

## Authority: child authority ⊆ parent authority

A delegated child runs under the intersection of its own profile policy and
every ancestor's restrictions; deny always wins, through any nesting depth.
- Enforced: `intersectRestrictions` / `effectiveDestructivePolicy`
  (`src/agent/registry.js`), consumed by the loop gate (`src/agent/loop.js`)
  and forwarded in the worker fork payload (`runDelegated`); the child row
  records `inherited_policy` as the audit trail.
- Pinned: `tests/delegation-authority.test.js` (lattice, live deny,
  allow-control, row forwarding).

## Budget: child consumption ≤ parent remaining budget

Slices never exceed remaining ceilings on any dimension and refuse on
exhaustion (no floors above remaining); completed delegations debit parent
USD+tokens immediately (incremental, partials included); wall-clock survives
resume via checkpointed start.
- Enforced: `sliceChildBudget`, `debitDelegation` (`registry.js`, `loop.js`),
  checkpoint `budget.started` round-trip.
- Pinned: `tests/delegation-authority.test.js` (slice matrix, live debit
  totals, wall-restore halt).

## Secrets: raw credential-shaped data must not cross persistence/display boundaries

Result-side text (step summaries, outcomes, evidence excerpts, trace entries)
is scrubbed with `redactSecrets` at every persistence choke before it can
reach `runs.db`, trace files, status/share/SSE/export reads, or ADAM memory.
- Enforced: `src/trace.js` patterns + `appendStep` / `importRun` /
  worker outcome paths / `buildEvidence` (`src/runs.js`,
  `src/agent/worker.js`, `src/agent/evidence.js`).
- Pinned: `tests/ledger-redaction.test.js` (class matrix, false-positive
  guards, live + imported + end-to-end outcome paths).
- Limitation (explicit): redaction is heuristic shape-matching, not universal
  detection. Caller-supplied inputs (objectives, tool args) are stored
  verbatim for replay fidelity — operators must not paste secrets into them.

## Filesystem: untrusted artifact paths stay within the authorized root

`ape_report` refs resolve inside the run-data directory only (canonicalized:
no absolute/`..`/symlink escape, directory-only).
- Enforced: `resolveReportRef` (`src/server.js`).
- Pinned: `tests/report-sandbox.test.js` (valid render, absolute/`..`/
  symlink/file rejections, honest not-found, listing preserved).

## Network: untrusted targets never reach protected infrastructure

Connector egress is allowlisted per connector AND checked against the SSRF
safety net (loopback/link-local/RFC1918/multicast/metadata, parser-aware
normalization incl. hex/short/IPv4-mapped forms, per-hop redirect
revalidation, credential-scoped hops with no cross-origin bodies).
- Enforced: `hostAllowed`, `normalizeIP`, `ipBlocked`, `ssrfCheck`,
  redirect chain (`src/connectors.js`).
- Pinned: `tests/ssrf.test.js`, `tests/connectors.test.js`.
- Limitation (explicit): DNS-rebinding TOCTOU between lookup and fetch is
  documented; full containment needs an egress proxy. `APE_ALLOW_PRIVATE_EGRESS=1`
  disables the net and is test/dev-only.

## Process: run control affects only the worker belonging to that run

Kills go to retained `ChildProcess` handles, never bare PIDs. Handleless
cancels against a live PID refuse honestly; reconcile reaps pinging-but-stale
rows by step freshness.
- Enforced: `cancelRunCore` (`src/server.js`), `reconcileRuns` (`src/runs.js`),
  delegation `killFn` (`src/agent/registry.js`).
- Pinned: `tests/worker-identity.test.js` (refusal without signaling,
  dead-PID marking, stale reaping, handle path).

## Authentication: unauthenticated requests never execute tools

Every `/api/*` route requires the session bearer (or configured static
token); share routes are token-scoped capabilities by design. Host
validation precedes auth. Strict CSP + no HTML-string rendering on clients.
- Enforced: `src/console.js` gate order, `SEC_HEADERS`; `/mcp` bearer +
  rate limits + session ceiling (`src/http.js`).
- Pinned: `tests/console-security.test.js`, `tests/console.test.js`,
  `tests/rate-limit.test.js`, `tests/http-limits.test.js`.
- Limitation (explicit): forwarding headers are trusted only from
  configured `APE_TRUSTED_PROXIES` peers; console SSE is best-effort
  (EventSource cannot bear tokens — polling is the supported transport);
  the `?t=` token lives in browser history until stripped (short-lived,
  `no-referrer` mitigates; share in private windows on shared machines).

## Supply chain: production runtime binaries install verified or not at all

Checksum mismatch deletes the file and refuses. Recorded sidecars make
present binaries re-verifiable; swaps fail instead of running.
- Enforced: `scripts/tui-fetch.mjs` (verify-on-hit), `scripts/fetch-adam.mjs`
  (fail-closed default, explicit unverified opt-out only).
- Pinned: `tests/tui-fetch.test.js`, `tests/adam-integrity.test.js`.
- Limitation (explicit): trust root is TLS + the ape-mcp release itself
  (checksums ship next to binaries; no signatures yet).
