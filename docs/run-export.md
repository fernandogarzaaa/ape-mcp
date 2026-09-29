# Portable run export/import (phase 2 of the stateful protocol)

A run's ledger slice — run row, step history, checkpoint, receipt — as a
versioned JSON bundle that any APE instance can import as a NEW run with
lineage linked, then resume. This is the cross-machine resume primitive and
the offline share artifact; it is also the disaster-recovery primitive (a
lost `runs.db` no longer means lost run history, as long as exports exist).

## The bundle

`ape_agent_export({run_id})` returns:

```json
{
  "version": 1,
  "exported_at": "<iso>",
  "run": { "<run row, minus worker_pid>" },
  "steps": [ "<full step rows, ordered>" ],
  "checkpoint": { "step": 12, "state": { "messages": [], "budget": {}, "...": "..." }, "updated_at": "<iso>" },
  "receipt": { "<parsed receipt or null>" },
  "manifest": { "signed": false, "exporter": "ape-mcp/1.0.1", "kind": "ape-run-export" }
}
```

Notes, stated plainly rather than hidden:

- `manifest.signed` is **always false in v1**. There is no key story yet;
  signing is a follow-up. Treat imported bundles with the same trust you give
  the channel they arrived over.
- `worker_pid` is stripped: PIDs are machine-local and meaningless elsewhere.
- Step `result_summary` values are truncated to 300 chars **in the ledger
  itself** — the bundle carries the fullest data the ledger holds, which is
  that truncation. Full verifier outputs ride in-memory only by design.
- Export is read-only and works on any run state (`running`, `stopped`,
  `done`, `failed`). Exporting a live run is allowed (snapshot use); see the
  divergence warning below.

## Import rules

`ape_agent_import({bundle})` accepts the bundle object or a JSON string.
Validation is fail-closed and ordered:

1. Not an object → `{error: "invalid_bundle"}`.
2. `version !== 1` → `{error: "unsupported_bundle_version"}`. A bundle from a
   newer ape-mcp is refused, never reinterpreted.
3. `bundle.run.run_id` missing → `{error: "invalid_bundle"}`.
4. No checkpoint state → `{error: "no_checkpoint"}` — same rule as
   `ape_agent_resume`: a run that never reached a model turn has nothing
   resumable.

On success the import mints a **new** `run_id` and:

- sets `parent_run_id` to the exported run's id,
- sets `resumes` to the source count + 1 (the lineage's continuation count;
  `APE_MAX_RESUMES` applies to the lineage, exactly like in-place resume),
- copies the step history with `run_id` remapped,
- plants the checkpoint row, so `ape_agent_resume` on the new run continues
  from the exported loop state,
- starts with `status: "stopped"`, `stop_reason: "imported"`, and no claim.

The result carries a `warning` when the source run was **live** at export:
do not resume the import while the source is still running — two workers
would diverge from the same checkpoint.

## Disaster recovery

```sh
# on the healthy machine
ape-mcp --claim-as inan ...  # then via MCP: ape_agent_export per run_id
# on the fresh machine: ape_agent_import per bundle, then ape_agent_resume
```

Exports are self-contained: re-importing every bundle rebuilds the run
history, checkpoints, and resume lineage. `deprecated_variants` (family-level,
not run-level) is not part of a run bundle.

## Size note

Bundles embed the full message history, so a long run's bundle can be large
(single-digit MB is normal; the checkpoint dominates). MCP tool arguments
carry it as JSON — there is no streaming import in v1. For very large runs,
export and import on the same host (or move the `.json` file yourself and
import from a local client) rather than pasting through a chat-sized window.
