# `ape` TUI — keys and run lifecycle

## Esc means different things on different screens

- **Onboarding demo (step 4/4): Esc detaches.** The demo run keeps going
  server-side; the TUI just stops watching and returns to the menu. The
  throwaway demo profile is deleted. Nothing is cancelled.
- **Menu run view: Esc cancels.** The TUI calls `ape_agent_cancel`: the
  worker process is killed immediately (no graceful drain — a tool call
  already in flight is interrupted, not finished), the run row goes
  `stopped`/`cancelled`, and the screen keeps the run id.

## Cancelled and detached runs stay pollable

Any run id — finished, cancelled, or still going — can be checked later
via the menu's **Check a run**, `ape-mcp run ape_agent_status
'{"run_id":"<id>"}'`, or the browser console's Runs view. Cancelling
never deletes ledger history; steps recorded so far remain.

## Notes

- A cancelled run cannot resume from the moment of cancel (resume works
  from checkpoints of stopped/failed runs; a kill has no checkpoint for
  the in-flight step).
- Cancelling a run claimed by another operator is refused
  (`claim_required`) — take or release the claim first.
