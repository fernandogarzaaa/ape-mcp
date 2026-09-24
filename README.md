# APE

**APE is an assistant that does multi-step jobs for you** — research, triage, validation — with budgets, receipts, and guardrails built in. Technically, it's an agent that lives inside the Model Context Protocol: instead of a host model chaining thin tools one call at a time, you invoke one tool (`ape_agent_run`) and an entire reasoning loop runs inside the server.

## Start here (5 minutes, no experience needed)

**What you need:**
- **Node.js 22.5 or newer** (free download from nodejs.org — pick the LTS version).
  - *On Windows:* if `npm i -g` gives a permission error, either run the terminal **as Administrator**, or avoid the issue entirely by installing Node via a version manager (`winget install fnm`, then `fnm install --lts`). Do not change permissions on system folders.
- **A way to talk to it** — an AI app you already use (Claude, OpenCode, Codex, Cursor, VS Code) *or* just a web browser.
- **Model access** — usually automatic: APE borrows the AI access your host app already has, so there's typically no new API key. Standalone use may need one key (Anthropic or OpenAI) — APE tells you if so.

**Install and check health:**

```bash
npm i -g ape-mcp
ape-mcp doctor      # checklist — all `ok` means you're good
ape-mcp             # opens the browser console (your home base)
```

**Run your first job.** Pick a *profile* (which specialist) and write one *objective* sentence:

| Profile | What it does |
|---|---|
| `repo-triage` | Sorts out software issues, recalls past decisions, proposes a plan |
| `research-verify` | Researches a question on the web, double-checks before answering |
| `persona-validate` | Tests an experience the way different users would |

More specialists ship bundled (`deep-researcher`, `code-reviewer`, `triage-lead`, `planner`, `supervisor`) — see "Bundled specialists" in [Profiles](docs/profiles.md), and multi-agent compositions in [Patterns](docs/patterns.md).

Example objective: *"Verify: Wikipedia is free."* You'll get back a **run ID** (like `run-a1b2c3d4`) — your tracking number for progress and results.

**Read the result.** Every job returns three things:

- **Outcome** — what the agent concluded, in words.
- **Outcome status** — how it ended: `success`, `unverified` (answered but couldn't fully check itself — treat as a draft), `exhausted` (ran out of budget — split the goal and retry in parts), `failed`, or `cancelled`. Don't read "finished" as "succeeded" — this label is the truth.
- **Cost and steps** — what it spent, so there are never surprise bills. The full step-by-step ledger is saved and inspectable.

**Safety nets you get automatically:** per-job spending/step/time budgets it cannot exceed; destructive actions denied by default (with caps and confirmations where allowed); verify-before-claim on the research profiles; everything recorded to a local ledger (`.ape/` folder on your machine).

**If something goes wrong:**

| Symptom | What to do |
|---|---|
| `doctor` shows a FAIL | Fix that item first — most often Node version or a missing model key |
| "no provider" error | Open APE from inside your host app, or set one model key |
| Job ends `exhausted` | Split the goal into smaller objectives and run them separately |
| Job ends `unverified` | Treat the answer as a draft; re-run with a narrower, checkable question |
| Console won't open | Make sure no other copy is already running, then retry |

**Terms worth learning:** *profile* (which specialist + its rules — a settings file you can tweak later), *run / run ID* (one execution + its tracking number), *objective* (your goal sentence — specific and single-goal works best), *ledger* (saved history of everything, with costs).

*Suggested first session: `doctor`, open the console, give `research-verify` a small factual question. Watch it work, then read its outcome, status, and cost — that one loop teaches the whole system.*

## For integrators & technical users

**The idea.** Standard MCP servers are stateless executors; all planning lives in the host's model. APE inverts this with the Tool Orchestrator pattern taken to its conclusion: the tool handler runs its own reasoning loop with its own model calls, memory, and database. The host sees a function call that returns a result — what happened inside is APE's implementation. The agent is defined by a profile (YAML you edit): model, tools, budget, destructive policy. You reshape the agent by editing a file, not forking code.

```text
HOST (Claude, Codex, OpenCode, Cursor, Hermes, VSCode)
        |  one config entry
        v
APE  -> agent runtime ->  Genesis, EVE, ADAM, Skein
        |                  connectors (user-authored, egress-allowlisted)
        v
      .ape/  runs.db, memory, ledger, trace
```

Point your MCP host at `bin/ape-mcp.js` (stdio) or `ape-mcp --http 8787`. Manifests ship in-repo (`.claude-plugin/`, `.opencode/plugin.json`, `mcpServers.json`, `.codex/skills/ape/`).

**Use:**

```bash
ape-mcp run ape_status '{}'
ape-mcp run ape_agent_profiles '{}'
ape-mcp run ape_connector_call '{"connector":"web","operation":"search","input":{"query":"MCP"}}'
ape-mcp run ape_agent_run '{"profile":"research-verify","objective":"Verify: Wikipedia is free."}'
```

Set a model key first (`APE_ANTHROPIC_API_KEY` or `APE_OPENAI_API_KEY`); `ape_agent_status` polls the run and shows every step and its cost. No key needed in most setups: `provider: auto` detects the host platform's active provider (OpenCode, Claude Code, or Codex session state, env, or a local model) and reuses its credentials; `ape_status` shows what was detected.

**Why this exists:** (1) host-chained tool calls are brittle and expensive to orchestrate — APE moves the loop server-side where each step is budgeted, traced, and recoverable; (2) agents need memory, audit, and budgets to be trustworthy — per-step ledger, governed mutations with confirmation gates, destructive-deny by default; (3) third-party access without per-service wrappers — declarative connectors (YAML endpoints, host allowlists, env-referenced auth; nothing outside the allowlist is contactable).

## Docs

Install, [Profiles](docs/profiles.md), [Connectors](docs/connectors.md), [Mods](docs/mods.md), [Security](docs/security.md), [Protocol compatibility](docs/protocol-compat.md), [Fixed task set](docs/task-set.md), [Changelog](CHANGELOG.md)

## License

MIT. APE code and all vendored engines (Genesis, EVE, ADAM, Skein). See `NOTICE.md`.
