# Changelog

## Unreleased

### Production hardening (no stubs)
- **Console fully wired**: new live `/api/graph` (skein), `/api/mods` (real hook flags),
  `/api/experience` (recent EVE runs from trace); Graph/Experience/Mods tabs render live
  data on a 10s poll instead of static copy. Live-audit now 20/20.
- **Provider set complete**: added `google` (Gemini OpenAI-compatible) and `opencode`
  (Zen) adapters; `CALLABLE_PROVIDERS` gate honest-skips non-invokable providers
  (e.g. bedrock) instead of crashing at call time.
- **Production packaging**: `.npmignore` + per-vendor `.npmignore` files exclude
  `node_modules`/`__pycache__` (npm-packlist ignores root rules under allowlisted dirs,
  so the exclusions live inside the vendored trees and are re-created by sync-vendors);
  `postinstall` installs genesis+eve deps on first install. Package: 1,652 files /
  13.4 MB with the prebuilt `adam-mcp.exe` included.

### Host-provider autodetection (`provider: auto`)
- APE now detects the provider the platform it's installed in is **currently using**
  (active-session state, not just stored credentials) and reuses its credentials.
- Readers: OpenCode session DB (`opencode.db` → newest `session.model`),
  Claude Code (`~/.claude.json` + OAuth token), Codex (`config.toml` + `auth.json`),
  env keys, local Ollama/llama.cpp probe.
- `provider: auto` is the default for all bundled profiles; explicit provider/model on
  `ape_agent_run` always wins. Resolution precedence: explicit → env → active → stored
  (best-effort) → local.
- Transparency: `ape_status` reports `active_provider` + `detected_providers` (names
  only); the run ledger records resolved `model` + `model_resolution`.
- Security: key material never leaves the worker — not in ledger, status, or responses
  (regression-tested); host stores opened readOnly.
- Fix: `fork()` no longer inherits the parent's `--input-type` execArgv (worker crashed
  under module-stdin harnesses).
- nebius base URL corrected to `https://api.studio.nebius.com/v1`.
- anthropic path supports Claude-session OAuth (Bearer; best-effort refresh) alongside
  `ANTHROPIC_API_KEY`.

## 1.0.0 (fork) — 2026-09-18

Hard fork of `fernandogarzaaa/godmode` at post-PR4 HEAD → **ape-mcp**. Hybrid-native MCP
server with an embedded, user-configurable agent.

### Rename / identity (Phase 0)
- Package + repo: `ape-mcp`; sole bin `ape-mcp` (avoids the Cosmopolitan `ape` loader
  collision).
- Tools renamed `godmode_*` → `ape_*` (required for coexistence of both packages on one
  host).
- `GODMODE_*` env → `APE_*`; data dir `.godmode/` → `.ape/`; manifests, CI, skills,
  tests renamed.
- **EVE-MIRO deleted** (AGPL boundary, venv footprint, zero wired capability). godmode
  keeps it; APE is MIT-only.

### Truth pass (Phase 1)
- **Mod hook system fixed**: `loadMods` now dynamically `import()`s `hooks.js`; the
  `policy-gates` preCall actually fires (was inert `{}`).
- **Async dispatch**: `execFileSync` → `execFile` everywhere; long engine calls no
  longer block the event loop.
- **Wired for real**: `ape_compare` → genesis `compare`; `ape_evolve` accept/reject →
  `adam_accept_mutation`/`adam_reject_mutation`; `ape_report` → real artifact inventory
  + genesis report render; fixed latent `dispatch.eveEntry` bug in `ape_mcp_eval`.
- Gates: zero silent stubs across all tools; `ape-map.yaml` ≡ `TOOL_DEFS` drift test.

### Agent runtime (Phase 2)
- `.ape/profiles/*.yaml` loader (bundled defaults + user overrides, hot reload).
- Reasoning loop (Tool Orchestrator) in a **detached worker process**; `ape_agent_run`
  returns `run_id` immediately.
- Providers: anthropic, openai-compatible (openrouter/local), **mock** (offline
  deterministic — test/demo). Provider fallback chain.
- Budget governor: `max_steps`/`max_tokens`/`max_usd`/`max_wall_seconds`; each halts
  independently; enforced after every model + tool call.
- Run ledger: `.ape/runs.db` via `node:sqlite` (targeted ExperimentalWarning
  suppression), per-step records, `ape://runs/{run_id}`.
- **Persistent ADAM client**: one spawned `adam-mcp` per process; memory calls in a run
  cost ≤1 spawn (gate-tested).
- Bundled profiles: `repo-triage`, `persona-validate`. §8.2 fixed task set authored.

### Connectors (Phase 3)
- Declarative `.ape/connectors/*.yaml`: `egress_allow` enforcement, auth-by-env,
  path/query/body templating, MRTR confirm for destructive ops.
- `ape_connector_list` / `ape_connector_call` tools.
- Flagship: `web` connector (Wikipedia API, no key) + `research-verify` profile.

### dev.ape/agent extension (Phase 4)
- `discover()` declares `dev.ape/agent` v0.1.
- Methods `agent/listProfiles`, `agent/describeProfile`, `agent/run`, `agent/getRun`,
  `agent/cancel` on stdio + HTTP; `ape_agent_cancel` tool parity.
- Real MCP client (SDK) handshake fixed: proper `initialize`/`ping`/notification
  handling with protocol-version negotiation.

### Release (Phase 5)
- `ape-mcp doctor` reports engine build state + **every** sanctioned egress host.
- CI matrix: Ubuntu/Windows/macOS × Node 22/24; license gate; all 4 test files.
- Docs: install, profiles, connectors, mods, security, protocol compat, task set.
- Engines bumped to Node >= 22.5 (built-in `node:sqlite`).

## 1.0.0 (godmode seed lineage)

See godmode's history. APE diverges from godmode at PR4 (2026-09-17).