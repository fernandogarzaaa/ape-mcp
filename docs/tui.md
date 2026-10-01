# `ape` TUI — screens, keys, lifecycle

Launch: `ape` (needs a terminal) or `ape-mcp tui`. Same binary, same
resolution (prebuilt → one-time cargo build); the package version is
passed as `APE_TUI_VERSION` so the status line reports the release.

## Screens (menu items)

Run an agent, Check a run, Profiles, Doctor, Console info, Status, Runs,
Ledger, Tasks, Quit. Every list scrolls with ↑/↓ and goes back with Esc;
footers name the keys per screen.

- **Main menu**: list on the left, the welcome banner on the right when the
  terminal fits both (one source of truth — same constant, single cyan
  accent, plain under `NO_COLOR`). Hidden below the computed threshold
  (art + widest item + gutter), never shrunk.
- **Runs**: newest-first run rows (id, profile, status, cost, steps,
  start). Enter opens a running run into the live progress view, else
  the finished view. Empty when no runs exist yet.
- **Ledger**: the governance audit stream (destructive attempts, genesis
  verdicts) via `ape_ledger`. `f` cycles the kind filter (all →
  destructive → genesis). Entries carry no run id or status, so no such
  filter exists — that is the data, not a missing feature.
- **Tasks**: the Skein graph as its CLI text. Needs python + a graph;
  errors render as-is.

## Run view keys

- ↑/↓ move across step blocks (selection follows the live tail until you
  move up), Enter expands the full stored summary, Esc cancels the run.
- The budget meter (`$spent/$limit · steps · tokens` + bar) stays on top
  while the run is live. Limits come from the picked profile; missing
  ceilings degrade to spent-only.
- `[DENIED]` blocks are loop policy denials; expanding shows the recorded
  reason (rows predating the reason say where it is not).
- Finished outcomes render as markdown (headings, lists, code with
  highlighting). Theme follows `APE_TUI_THEME` (below).

## Objective box keys

- Enter sends (empty sends nothing). Alt+Enter inserts a newline for
  multiline objectives (where the terminal delivers Alt+Enter); Ctrl+J
  does the same and is the reliable key on Windows, where Windows
  Terminal binds Alt+Enter to fullscreen by default.
- ↑/↓ recalls session input history (oldest ↔ newest, draft restored
  past the end). ←/→ move by character, across lines.
- Typing `/` opens the slash menu (fuzzy): /profile /runs /ledger
  /tasks /status /doctor. ↑/↓ picks, Enter jumps through the same
  transition the menu item uses, Esc goes back. Unmatched `/text`
  sends literally as the objective.

## Provider setup (no keys leave the terminal)

Onboarding step 2 and the **Provider** menu item share one picker: detected
providers with their source (environment, opencode session, claude code,
codex, ollama/llama.cpp), a model field prefilled from the provider
default, and **F5** for a one-call connection test (success with latency
and cost, or the upstream error verbatim). In onboarding, Enter on a real
provider runs the test first and only advances on a pass; **mock** skips
the gate explicitly. The menu picker saves freely. Enter saves the
provider+model pin to the local config; runs and the CLI resolve through
the same `resolveModel` (explicit overrides > env > pinned file >
profile > auto-detect).

Secrets are never written anywhere by the TUI. If no provider is
detected, set a key in the calling shell before launching:

```powershell
$env:APE_ANTHROPIC_API_KEY = "sk-..."
$env:APE_OPENAI_API_KEY = "sk-..."
```

(Process-scoped; dies with the shell. For persistence, use your OS
credential store or shell profile — the TUI will detect whatever the
host makes available.)

## Status line

`provider: X · model: Y · profile: Z · ape-mcp V`: the version is embedded at build
time from package.json (launcher env wins when present), so every launch
path reports the release. The provider primes once per menu entry with a
single `ape_status` call; unknown stays `unknown` until known. During a
run the line goes live (id, profile, state, spent).

## Failed runs

A `model_error` outcome carrying a JSON payload renders its human fields
(`error:`, `message:`) plus the stop reason; the raw blob stays one
expand away in the timeline. Step summaries are capped at 300 chars at
write time (said on screen at full length).

## Onboarding flow (re-runnable via Setup again or --onboard)

Doctor → Provider → Profile → Connectors → First run → Done. Esc walks
back at every step, never traps.

- **Provider**: the shared picker. Real providers need a passing F5 test
  to continue (Enter runs the test first); **mock** is an explicit labeled
  choice that skips the gate and says mock everywhere. A failed test shows
  the exact `$env:` / `setx` commands for providers that take env keys.
- **Connectors**: lists configured connectors (web ships with APE).
  Informational — any key continues, M8 starters land here.
- **First run**: objective prefilled per profile with the profile's budget
  shown, live polls while running, mock path labeled. A failed start
  shows the error with Enter-to-retry (no provider claims — the mock demo
  never needed a real model, and neither does this step when mock).
- **Done**: provider/model/profile, data dir, where runs and ledger live.
  Enter opens the menu, `r` jumps to Runs, `p` to Provider.

## Esc means different things on different screens

- **Onboarding first run: Esc detaches.** The run keeps going
  server-side; the TUI just stops watching and returns to the menu. The
  throwaway mock profile (mock path only) is deleted. Nothing is cancelled.
- **Menu run view: Esc cancels.** The TUI calls `ape_agent_cancel`: the
  worker process is killed immediately (no graceful drain — a tool call
  already in flight is interrupted, not finished), the run row goes
  `stopped`/`cancelled`, and the screen keeps the run id.

## Cancelled and detached runs stay pollable

Any run id — finished, cancelled, or still going — can be checked later
via the menu's **Check a run**, `ape-mcp run ape_agent_status
'{"run_id":"<id>"}'`, or the browser console's Runs view. Cancelling
never deletes ledger history; steps recorded so far remain, plus a
`kind: "cancel"` marker row naming the last recorded step (the in-flight
step itself is unknowable server-side and is not reconstructed).

## Run-row totals are live

Since the ledger fix, the run row's cost/tokens/steps update with every
streamed step — the budget meter reads the row directly. Model turns
count as steps (matches `max_steps`); halt marker rows can read one high
until the terminal write corrects them.

## Step summaries are capped at write time

The ledger stores max 300 chars per step summary (`runs.js appendStep`).
Expanding a step shows everything stored; a full-length summary says so
rather than implying more text exists.

## Notes

- A cancelled run cannot resume from the moment of cancel (resume works
  from checkpoints of stopped/failed runs; a kill has no checkpoint for
  the in-flight step).
- Cancelling a run claimed by another operator is refused
  (`claim_required`) — take or release the claim first.

## Environment variables

- `APE_TUI_VERSION` — release version for the status line (set by the
  `ape-mcp tui` launcher from package.json; crate version fallback).
- `APE_TUI_THEME` — `light` or `dark` syntax-highlight theme. Auto
  detection reads `COLORFGBG` (xterm); Windows terminals expose no theme
  signal, so set this explicitly there. Default: dark.
- `APE_MCP_JS` — override path to `bin/ape-mcp.js` for the TUI bridge
  (dev/testing).
- `APE_DATA_DIR` — data dir (runs, ledger, worker logs); the TUI inherits
  the caller's environment like every other surface.
- `APE_WORKER_LOG_DAYS` — retention for `ape-mcp prune` (default 14).
- `APE_SKIP_TUI_DOWNLOAD` — `1` skips the postinstall prebuilt fetch.
- `APE_MOCK_STEP_DELAY_MS` — test-only: per-turn delay in mock runs
  (snapshot harness uses it to observe genuine `running` frames).
