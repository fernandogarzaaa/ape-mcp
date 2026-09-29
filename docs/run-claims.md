# Run claims and discovery (phase 1 of the stateful protocol)

Two operators (or two clients) driving the same run is how work gets
double-spent. Claims give a run exactly one driver at a time, without
accounts: an operator identity, a conflict signal, and a handoff path.

## The protocol

1. **Discover.** `ape_agent_list({status?, profile?, parent_run_id?, limit?})`
   returns runs any client can see: `run_id`, canonical `uri`
   (`ape://runs/<run_id>`), status, claim state, cost, and resume count.
   Every tool that takes a `run_id` also accepts the `uri` form.
2. **Claim.** `ape_agent_claim({run_id, claimant?})` marks you as the driver.
   - Live run held by someone else: `{error: "claim_conflict", status: 409,
     holder}`. Ask the holder to release, or re-run under their name.
   - Unclaimed run: the claim is granted (exclusive while live).
   - Terminal run (`done`/`stopped`/`failed`): claims are **advisory** —
     anyone may take one, and the previous holder is reported, so handoff is
     one extra call instead of a deadlock.
3. **Drive.** While a live run is claimed, `ape_agent_cancel` only honors the
   holder (others get `{error: "claim_required", status: 403, holder}`).
   `ape_agent_resume` requires the holder whenever a claim is set — even on
   stopped runs, otherwise handoff protection is bypassed exactly when it
   matters. On a successful resume the claim transfers to the resumer.
4. **Release.** `ape_agent_release({run_id, claimant?})` clears your claim.
   Only the holder can release; releasing an unclaimed run is a no-op.

## Who am I? (claim identity precedence)

1. Explicit `claimant` tool argument.
2. `APE_CLAIM_AS` env, set by the `--claim-as <name>` CLI flag
   (`ape-mcp --claim-as inan ...`, works for stdio, `--http`, and `run`).
3. The MCP client's declared `clientInfo.name` plus a short session hash
   (e.g. `opencode#sess-abc`), retained from `initialize` on both transports.
4. `"anonymous"`.

Use (1) or (2) for a stable identity that survives reconnects; (3) keeps
anonymous clients contained to their own session.

## Resume lineage in status

Resume is in-place (same `run_id`): `ape_agent_status` surfaces
`resume_count` and `resumed_from` (the checkpoint step the latest resume
restarted from, `null` when never resumed), plus the current `claimant`.
Run creation, resume, cancel, and the compact status summary also return the
canonical `uri`.
