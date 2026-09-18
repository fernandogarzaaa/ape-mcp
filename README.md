# APE

APE is an agent that lives inside the Model Context Protocol. Instead of a host model chaining thin tools one call at a time, you invoke one tool (`ape_agent_run`) and an entire reasoning loop runs inside the server: it calls tools, checks a budget, records every step to a ledger, and returns a finished outcome with a run id you can poll.

## The idea

Standard MCP servers are stateless executors. All planning lives in the host's model, which must chain many small tool calls to get anything done. APE inverts this with the Tool Orchestrator pattern taken to its conclusion: the tool handler runs its own reasoning loop with its own model calls, memory, and database. The host sees a function call that returns a result. What happened inside is APE's implementation.

The agent is not fixed-purpose. It is defined by a profile (YAML you edit): which model it uses, which tools it may call, what budget it gets, and what policy governs destructive actions. You reshape the agent by editing a file, not by forking code.

## Why this exists

Three problems it solves:

1. **Chained tool calls are brittle and expensive to orchestrate from the host.** Long multi-step work (triage an issue, validate an experience, research a claim) requires the host to hold the whole plan. APE moves the loop server-side, where each step is budgeted, traced, and recoverable.
2. **Agents need memory, audit, and budgets to be trustworthy.** Every APE run records per-step tool calls, tokens, and cost to a ledger; mutations go through governed accept/reject with confirmation gates; destructive actions are denied by default inside loops. The behavior is inspectable after the fact, not a black box.
3. **Reaching third-party services usually means installing a wrapper per service.** APE uses declarative connectors: a YAML file describing endpoints, an allowlist of hosts, and auth by environment reference. No per-service code ships in APE, and nothing outside the allowlist can be contacted.

## What it does

- Runs user-configurable agent profiles (`repo-triage`, `persona-validate`, `research-verify`, or your own) with a real model in the loop.
- Orchestrates four engines (Genesis for evaluation, EVE for experience validation, ADAM for memory and governed evolution, Skein for task graphs) as internal tools.
- Detects the host platform's active model provider automatically (`provider: auto`) and reuses its credentials, so a fresh install typically needs no new API key.
- Exposes everything as MCP tools plus a `dev.ape/agent` extension, with a browser console for live trace, tasks, ledger, and run inspection.

```text
HOST (Claude, Codex, OpenCode, Cursor, Hermes, VSCode)
        |  one config entry
        v
APE  -> agent runtime ->  Genesis, EVE, ADAM, Skein
        |                  connectors (user-authored, egress-allowlisted)
        v
      .ape/  runs.db, memory, ledger, trace
```

## Install

Node.js >= 22.5.

```bash
npm i -g ape-mcp
ape-mcp doctor      # engine build state + every sanctioned egress host
ape-mcp             # browser console (Live Trace, Tasks, Ledger, CLI)
```

Point your MCP host at `bin/ape-mcp.js` (stdio) or `ape-mcp --http 8787`. Manifests ship in-repo (`.claude-plugin/`, `.opencode/plugin.json`, `mcpServers.json`, `.codex/skills/ape/`).

## Use

```bash
ape-mcp run ape_status '{}'
ape-mcp run ape_agent_profiles '{}'
ape-mcp run ape_connector_call '{"connector":"web","operation":"search","input":{"query":"MCP"}}'
ape-mcp run ape_agent_run '{"profile":"research-verify","objective":"Verify: Wikipedia is free."}'
```

Set a model key first (`APE_ANTHROPIC_API_KEY` or `APE_OPENAI_API_KEY`); `ape_agent_status` polls the run and shows every step and its cost.

No key needed in most setups. Profiles default to `provider: auto`, which detects the provider the host platform is currently using (OpenCode, Claude Code, or Codex session state, env, or a local model) and reuses its credentials. `ape_status` shows what was detected.

## Bundled profiles

| Profile | What it does | Needs |
|---|---|---|
| `repo-triage` | Triages issues, recalls prior decisions, audits claims | provider (auto-detected or key) |
| `persona-validate` | EVE persona-driven experience validation, seeded | provider (auto-detected or key) |
| `research-verify` | Web research + verify-before-claim via the `web` connector | provider (auto-detected or key) |

## Docs

Install, [Profiles](docs/profiles.md), [Connectors](docs/connectors.md),
[Mods](docs/mods.md), [Security](docs/security.md),
[Protocol compatibility](docs/protocol-compat.md), [Fixed task set](docs/task-set.md),
[Changelog](CHANGELOG.md)

## License

MIT. APE code and all vendored engines (Genesis, EVE, ADAM, Skein). See `NOTICE.md`.
