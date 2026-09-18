# APE

**APE** is a hybrid-native MCP server: a user-configurable agent, a multi-engine harness
underneath it, and declarative connectors to reach third-party services — all in one
package, all vendored, nothing to clone.

```text
HOST (Claude · Codex · OpenCode · Cursor · Hermes · VSCode)
        │  one config entry
        ▼
APE  → agent runtime →  Genesis · EVE · ADAM · Skein (vendored, pinned)
        │               connectors (user-authored, egress-allowlisted)
        ▼
      .ape/  runs.db · memory · ledger · trace
```

## Why APE

- **An agent that lives inside MCP.** `ape_agent_run` starts a profile; the reasoning
  loop runs internally and returns a `run_id`. The host sees one tool call.
- **Reconfigurable, not fixed.** Profiles are YAML you edit — what the agent is, which
  tools it may call, its budget. No fork needed.
- **Reach without wrappers.** Declarative connectors (`egress_allow` + auth-by-env) let
  you give the agent any API. The bundled `web` connector works with **no API key**.
- **No 5-repo clone.** Genesis, EVE, ADAM, and Skein ship vendored and commit-pinned.
  The only network egress is model providers and your connectors — printed by `doctor`.
- **Auditable.** Every agent step (tool, args hash, duration, tokens, cost) is recorded
  in the run ledger; every mutation lands in the hash-chained audit ledger.

## Install

Node.js **≥ 22.5**.

```bash
npm i -g ape-mcp
ape-mcp doctor      # engine build state + every sanctioned egress host
ape-mcp             # browser console (Live Trace · Tasks · Ledger · CLI)
```

Point your MCP host at `bin/ape-mcp.js` (stdio) or `ape-mcp --http 8787`. Manifests ship
in-repo (`.claude-plugin/`, `.opencode/plugin.json`, `mcpServers.json`, `.codex/skills/ape/`).

## Use

```bash
ape-mcp run ape_status '{}'
ape-mcp run ape_agent_profiles '{}'
ape-mcp run ape_connector_call '{"connector":"web","operation":"search","input":{"query":"MCP"}}'
ape-mcp run ape_agent_run '{"profile":"research-verify","objective":"Verify: Wikipedia is free."}'
```

Set a model key first (`APE_ANTHROPIC_API_KEY` or `APE_OPENAI_API_KEY`); `ape_agent_status`
polls the run and shows every step and its cost.

**No key needed.** Profiles default to `provider: auto`, which detects the provider the
host platform is *currently using* (OpenCode / Claude Code / Codex session state, env, or
a local model) and reuses its credentials. `ape_status` shows what was detected.

## Bundled profiles

| Profile | What it does | Needs |
|---|---|---|
| `repo-triage` | Triages issues, recalls prior decisions, audits claims | model key |
| `persona-validate` | EVE persona-driven experience validation, seeded | model key |
| `research-verify` | Web research + verify-before-claim via the `web` connector | model key only |

## Docs

Install · [Profiles](docs/profiles.md) · [Connectors](docs/connectors.md) ·
[Mods](docs/mods.md) · [Security](docs/security.md) ·
[Protocol compatibility](docs/protocol-compat.md) · [Fixed task set](docs/task-set.md) ·
[Changelog](CHANGELOG.md)

## License

MIT — APE code and all vendored engines (Genesis, EVE, ADAM, Skein). See `NOTICE.md`.