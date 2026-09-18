# Protocol compatibility statement

**Baseline:** MCP 2026-07-28 (stateless core, state in handles, Extensions framework).

## Version pinning

- The server negotiates `initialize` with the client's requested `protocolVersion` when
  the client sends one, falling back to `2026-07-28`. All core methods (`tools/list`,
  `tools/call`, `resources`, `prompts`) are compatible across the supported range.
- `server/discover` (legacy) reports `protocol: "2026-07-28"` and the server's
  `capabilities`.

## What a host can rely on

| Capability | Status |
|---|---|
| `tools/list` / `tools/call` | Stable. Tool names are `ape_*`; schemas are JSON Schema. |
| `io.modelcontextprotocol/tasks` extension | Stable. `ape_task_start`/`ape_task_get` (+ `tasks/get`). |
| `dev.ape/agent` extension | v0.1. Methods: `agent/listProfiles`, `agent/describeProfile`, `agent/run`, `agent/getRun`, `agent/cancel`. **Optional** — a host that does not negotiate it simply never sees it; no error, no silent degradation. |
| A2A bridge | `GET /.well-known/agent.json` (agent card, profiles as skills) + JSON-RPC `POST /a2a`: `message/send`, `tasks/get`, `tasks/cancel`. Compatible subset (no streaming/push in v1); every task is a fully audited APE run. |
| Tool parity for the agent | `ape_agent_run`, `ape_agent_status`, `ape_agent_cancel`, `ape_agent_profiles` work on any host with tool support. |

## Compatibility policy

- Tool names and schemas are considered public API. Renames are a **breaking change**
  and are gated behind a CHANGELOG entry.
- Extension methods are additive. A new method does not require a version bump unless it
  changes an existing method's contract.
- `dev.ape/agent` is namespaced (`dev.ape/*`) per the Extensions framework; core-spec
  adoption later is optional and separate. No central approval is required to define a
  capability under your own namespace.
- Breaking changes to the `ape_*` tool surface land only on a minor/major version bump,
  never a patch.

## Verification

Every gate is verified through a real MCP client (`@modelcontextprotocol/sdk`) plus the
stdio/HTTP surfaces, never ad-hoc JSON-RPC framing. See `tests/extension.test.js` and
`scripts/live-audit.ps1`.