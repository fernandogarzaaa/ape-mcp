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
  max_destructive: 1            # cap on unattended destructive calls (when allowed)
  max_repeats: 3                # halt if the same (tool, args) repeats this often
policy:                         # loop policy
  destructive: deny              # deny (default) | allow. Allow is still capped + audited
  verify_before_finish: warn    # warn (default) | enforce | off
  evidence: any                 # any (presence passes) | agree (verdicts must agree, no refutations)
  eve_threshold: 50             # EVE score at/above this counts as supporting evidence
stop_conditions:
  - no_tool_call_in_step
  - explicit_final_answer
  - budget_exhausted
```

## Providers

**`provider: auto` is the default** — APE detects the provider the platform it's
installed in is *currently using* and reuses its credentials. Nothing about which provider
is hardcoded; resolution is dynamic and run-time.

Detection reads, in order:
1. **Explicit** `provider`/`model` on `ape_agent_run`, then `APE_PROVIDER`/`APE_MODEL` env.
2. **Active provider** — the platform's current session state:
   - OpenCode: newest `session.model` in `opencode.db` (e.g. `nebius` + `deepseek-ai/DeepSeek-V4-Flash-0731`).
   - Claude Code: `~/.claude.json` `model` + OAuth access token (Bearer).
   - Codex: `config.toml` `model` + `auth.json` token.
   - env: `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/… (+ `*_MODEL`).
3. **Stored-credential fallback** (marked `best-effort`).
4. **Local** — Ollama / llama.cpp probe.

| detected provider | credential source |
|---|---|
| `nebius`, `groq`, `openrouter`, `openai`, `ollama-cloud` | host store / env key (OpenAI-compatible) |
| `anthropic` | `ANTHROPIC_API_KEY` env, or Claude session OAuth token (Bearer; needs a valid session) |
| `local` | Ollama / llama.cpp at `localhost` |

`ape_status` reports `active_provider` and `detected_providers` (names only — keys are
never exposed). The run ledger records the resolved `model` and `model_resolution`
(`explicit` / `active` / `best-effort`) so every run shows exactly what it used.

A profile may still pin a provider or model explicitly — that always wins over detection:

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