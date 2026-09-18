# Security model

## Network egress — closed by default

APE makes **no** outbound connection at runtime except two explicitly configured paths:

1. **Model providers** — declared in a profile (`anthropic`, `openai`, `openrouter`,
   `local`). Listed in `ape-mcp doctor` under "egress hosts".
2. **Connectors** — every connector declares `egress_allow`; requests to other hosts are
   refused (`egress_denied`) and traced.

Everything else is vendored and pinned in `vendors/manifest.yaml`. No runtime
`git clone`, no `npx -y <other-repo>`. Verified by the self-containment gate.

## Secrets

- Credentials are resolved at run time from **environment variables or the host platform's
  own credential store** (OpenCode `auth.json`, Claude `.credentials.json`, Codex
  `auth.json`) — never hardcoded, never written to APE state.
- **Key material never leaves the worker's memory.** It is not stored in the run ledger,
  not echoed in `ape_status` / `ape_agent_profiles` / tool responses (only provider +
  model + `resolution` are surfaced), and never logged. Verified by tests.
- Host credential stores are read with **readOnly** access; APE never modifies them.
- `ape-mcp doctor` prints hosts, never tokens.

## Destructive operations — MRTR confirm

Tools and connector ops annotated `destructive: true` return `input_required` unless
explicitly confirmed. An agent calling a destructive connector op is told to ask the
user; it cannot silently mutate external state.

## Auth (local-first)

- HTTP surface is open on loopback by default (v1).
- Opt-in bearer enforcement: `APE_REQUIRE_AUTH=1 APE_TOKENS=<csv>`. RFC 9728
  well-known document at `GET /.well-known/oauth-protected-resource`.
- Future IdP: `APE_AUTH_SERVERS='["https://idp.example.com"]'`.

## Cost

The **budget governor** (`max_usd`, `max_steps`, `max_tokens`, `max_wall_seconds`) is the
only thing between a misconfigured agent loop and an unbounded bill. It is checked after
every model call and every tool call, and each limit halts the loop independently. Not
optional polish.

## Mods

Mods run in-process with full access — the code-level trust boundary. Connectors are the
declarative, sandboxed alternative. See `mods.md`.

## License

All vendored engines are MIT. APE ships **no AGPL component**; the license gate fails CI
if any AGPL text appears in `vendors/`.