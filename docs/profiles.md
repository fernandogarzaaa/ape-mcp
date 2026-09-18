# Agent profiles

A profile is the user-editable definition of what the agent *is*. Loaded at call time —
no restart. Bundled defaults live in `profiles/`; user overrides in `.ape/profiles/` win.

## Anatomy

```yaml
name: repo-triage
description: Triages incoming issues against the codebase and proposes a plan.
model:
  provider: anthropic          # anthropic | openai | openrouter | local | mock
  id: claude-sonnet-4-6
  fallback: { provider: openrouter, id: anthropic/claude-sonnet-4-6 }
system: |
  You triage issues. Always call memory.recall before proposing.
tools:                          # what the agent may call inside its loop
  - engine: skein.orchestrate
  - engine: genesis.audit_claim
  - connector: web              # user-defined, see connectors.md
  - builtin: memory.recall
  - builtin: memory.store
  - builtin: finish             # terminal: model calls finish(summary) when done
limits:                         # budget governor — enforced every step
  max_steps: 12
  max_tokens: 120000
  max_wall_seconds: 300
  max_usd: 0.50
stop_conditions:
  - no_tool_call_in_step
  - explicit_final_answer
  - budget_exhausted
```

## Providers

Credentials come from environment variables — **never stored in profile YAML**:

| provider | env |
|---|---|
| `anthropic` | `APE_ANTHROPIC_API_KEY` (or `ANTHROPIC_API_KEY`) |
| `openai` | `APE_OPENAI_API_KEY` (+ optional `APE_OPENAI_BASE_URL`) |
| `openrouter` | `APE_OPENROUTER_API_KEY` |
| `local` | `APE_LOCAL_BASE_URL` (default `http://localhost:11434/v1`, Ollama/llama.cpp) |
| `mock` | none — deterministic offline script (tests/demos only) |

A primary provider failure automatically falls back to `fallback`. Provider calls are a
sanctioned egress path; `ape-mcp doctor` lists every host APE may contact.

## Tool entries

- `engine: <engine>.<tool>` — calls the corresponding `ape_<tool>` tool.
  Known engines: `genesis`, `eve`, `adam`, `skein`. E.g. `engine: genesis.audit_claim`
  → `ape_audit_claim`.
- `builtin: memory.recall` / `builtin: memory.store` — ADAM durable memory.
- `builtin: finish` — the explicit-final-answer terminal.
- `connector: <name>` — a user-defined connector (see connectors.md).

## The reasoning loop

```
load profile → hydrate context
  ↓
loop until stop condition:
  model call (system + history + internal tool schemas)
    ↓
  if tool_call: route to engine | connector | builtin; append result; record step; check budget
    ↓
  if finish / no tool call / budget exhausted: stop
  ↓
persist run to .ape/runs.db, return outcome + run_id
```

The host sees one tool call (`ape_agent_run`); the loop is APE's implementation.
Every step is recorded in the run ledger: tool, args hash, duration, tokens, cost.