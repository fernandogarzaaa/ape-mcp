# GodMode live-run gaps & improvements (2026-09-17)

Ran GodMode live as a plugin + MCP (stdio + HTTP) and drove all tools through the
exact same path a plugin client uses (`scripts/live-audit.ps1`, now 17/17 green
with real payload verification). Findings below: **fixed this session** vs
**open / queued**.

## Fixed this session

1. **`godmode_beliefs` + `godmode_genome` promised but not registered.** The tool
   map and `skills/godmode/SKILL.md` referenced them; the server returned
   `unknown_tool`. → Registered; now call the real vendored `adam-mcp` binary.
2. **Memory tools were stubs.** `godmode_remember/recall` returned a note instead
   of persisting. → New `src/adam-client.js` spawns the vendored
   `adam-mcp` binary over line-delimited JSON-RPC (`initialize` → `tools/call`)
   and drives `adam_memory_store`/`adam_memory_query`/`adam_beliefs`/`adam_genome`
   for real. Proven end-to-end: store returns a memory id, recall returns the
   embedded record. State lives under `$GODMODE_DATA_DIR` (`adam_memory.db`,
   `adam_genome.json`).
3. **`godmode_mcp_eval` missing.** EVE's `mcp-eval` (schema/conformance/fuzz
   oracles) exists in the vendored CLI but wasn't surfaced. → Registered and wired
   to `node vendors/eve/bin/eve.js mcp-eval <target>`.
4. **Skein orchestration needed `PYTHONPATH` manually.** `godmode_orchestrate`
   shells out to `python -m skein.cli`; from a bare `node godmode-mcp.js` the
   vendored package wasn't importable. → Dispatch now injects
   `PYTHONPATH=vendors/skein/src` automatically (same will apply to eve-miro).
5. **No ledger surface.** `godmode_audit_claim` wrote hash-chained entries but the
   console Ledger tab was a static placeholder. → `audit_claim` appends a summary
   to `.godmode/ledger.jsonl`; console `/api/ledger` + Ledger tab now render it.
6. **Test/audit blind spot — PowerShell `$args` automatic variable.** `live-audit.ps1`
   named a param `$args`, which PowerShell silently shadows, so every call went out
   with **empty arguments** (8 checks were vacuous; evolve/task "failed"). Renamed to
   `$params` and rewrote checks to assert **payloads reached the engines**, not just
   `resultType`. Now 17/17.
7. **ADAM client bugs caught live:** `child.stderr` is null under `inherit`; request
   `id` was hardcoded to 1 so `tools/call` was never answered. Both fixed.

## Open / queued (next slices)

- **`godmode_world_simulate` + eve-miro Python side.** Returns the provenance
  contract but doesn't run MIRO; needs Python 3.12 venv + deps. Add
  `godmode setup` to provision `.godmode/venv` (eve-miro fabric) — fail-closed
  today is honest, but a setup step makes it usable.
- **`godmode_compare` is a placeholder** (returns a note). Wire to
  `vendors/genesis compare/regression` like `audit_claim`.
- **`godmode_evolve` governance note only.** MRTR confirm works; `accept` should
  call `adam_accept_mutation` through the new client after confirm.
- **Long tool results truncated at 4000 chars** in `content`. Return full output
  or a resource handle for large reports.
- **Console Experience / Graph / Mods tabs are static copy.** Trace, Tasks, Ledger,
  CLI are live; wire EVE report embed (report://), Skein canvas (graph://), and
  mod listing/toggle next.
- **Cross-platform `adam-mcp` binaries** land from the `adam-binaries` release
  workflow (tagged builds) + `fetch-adam.mjs`; win-x64 ships in-repo today.
- **Local dev rebuild gap:** re-vendoring sources doesn't rebuild `dist/` until the
  updater runs; add a `npm run vendor` → auto-rebuild note (CI updater already does it).

## GitHub Actions failures (2026-09-17) — diagnosed & fixed

Three red clusters, one root cause plus one permission issue:

1. **`adam-binaries.yml` "invalid workflow file" (0s, every push).** `with: { targets: ${{ matrix.target }} }`
   used flow-style mapping containing a brace expression — the `}}` collides with the flow map's
   `}` and breaks parsing (reproduced with actionlint 1.7.12). **Fix is already in PR #3**
   (block-style `with:` + explicit `ext` per matrix row + `fail-fast: false` + binary smoke step).
   Merging PR #3 clears it; verified `actionlint` exit 0 on that branch's file.
2. **`auto-update` fails at "Open update PR": `GitHub Actions is not permitted to create or approve
   pull requests`.** Repo setting off. Fix shipped here: workflow now uses
   `secrets.GODMODE_SYNC_TOKEN || github.token` (PAT in godmode repo) and docs tell you the
   one-click alternative (Settings → Actions → General → allow PR creation). The sync itself —
   resolve → clone → re-vendor → rebuild → license gate → verify — all **succeeded** in that run.
3. **Dependabot "github-actions in / - Update" failed**: cascade of (1) —
   `/.github/workflows/adam-binaries.yml not parseable`. Clears when PR #3 merges.

`ci.yml` + `auto-update.yml` validated clean with actionlint (exit 0).

## Verification gate after fixes

`npm test` 12/12 · `scripts/live-audit.ps1` **17/17** (real HTTP calls, real ADAM
memory store→recall, MRTR confirm, task lifecycle) · `smoke` 15 tools · `doctor` 8/8 ·
license gate ok · `verify-adam` handshake ok.