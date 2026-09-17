---
name: godmode
description: Activate the unified GodMode stack (Genesis + EVE + ADAM + Skein + MIRO) as one agentic loop. Use when user says godmode, validate experience, audit verifier, orchestrate tasks, simulate world, evolve memory, or persist decisions.
---

# /godmode — Unified Product Engine (standalone: vendors/ vendored, no 5-repo clone)

## Shared state (local-only v1)
- ADAM organism → `$GODMODE_DATA_DIR/adam_memory.db` + `adam_genome.json` (or `organism_id` pool)
- Skein graph → `.skein/log.ndjson` (append-only) + derived `graph.json`
- EVE sessions → seeded, reproducible; reports via `godmode_report`
- Genesis ledger → hash-chained evidence bundles
- MIRO → WorldState(t0) OBSERVED vs SIMULATED (never mixed) + reality ledger
- Trace → `.godmode/trace.ndjson` (console Live Trace)

## Passive activation (every session, no permission needed)
1. `godmode_status` → versions + engines + mods
2. `godmode_recall` with task-topic query → prior decisions
3. Report genome/ledger head briefly

## Active loop (per task)
```
BEFORE: godmode_recall ("solved before?") + godmode_beliefs query
WHILE:  godmode_validate_experience (seed always) for UI; godmode_audit_claim for verifiers
AFTER:  godmode_remember (decision|fix|code|conversation) + godmode_orchestrate evidence
EVOLVE: godmode_evolve propose → measure (EVE) → accept/reject (governance: values/goals/capabilities/policies need EVE approve; preferences.* ungated; destructive needs confirm)
WORLD:  godmode_world_simulate for typhoon/market scenarios (provenance-labeled)
```

## Tool quick reference
| Need | Tool |
|---|---|
| status | godmode_status |
| remember/recall | godmode_remember / godmode_recall |
| UX sim | godmode_validate_experience {url, persona, goal, seed} |
| MCP eval | godmode_mcp_eval (via validate path) |
| audit verifier | godmode_audit_claim {suite, verifier} |
| compare builds | godmode_compare |
| tasks | godmode_orchestrate {op: graph/claim/release/status/log} |
| world sim | godmode_world_simulate {scenario} |
| evolve | godmode_evolve {action, proposal_id} (+confirm) |
| reports | godmode_report |

Seeds always for reproducibility. Long runs return task handles (poll). Console: `godmode` opens Live Trace + CLI pane (same dispatch as MCP).
