# GodMode

Standalone universal plugin + MCP product engine: **Genesis** (evaluation & assurance) + **EVE** (experience validation) + **ADAM** (cognitive substrate) + **Skein** (task-graph orchestration) + **EVE-MIRO** (reality-grounded simulation). Users install **only godmode** — the 5 repos ship vendored inside (`vendors/`, pinned in `vendors/manifest.yaml`).

## Install

```bash
npm i -g godmode            # or clone fernandogarzaaa/godmode
godmode doctor              # all vendored engines present?
godmode                     # opens browser console (CLI + Live Trace) on 127.0.0.1 auto-port
```

MCP clients (Claude/Codex/OpenCode/Cursor/VSCode): point at `bin/godmode-mcp.js` (stdio) or `godmode-mcp --http 8787`. Manifests: `.claude-plugin/`, `.codex/skills/godmode/`, `.opencode/plugin.json`, `mcpServers.json`.

## Use

```bash
godmode run godmode_status '{}'
godmode run godmode_validate_experience '{"url":"mock:","persona":"curious-explorer","seed":7}'
godmode run godmode_audit_claim '{"suite":"code"}'
godmode run godmode_orchestrate '{"op":"status"}'
```

Browser console: Live Trace · Task Graph · Experience · Ledger · Mods · CLI pane (same dispatch as `tools/call`).

## Auth

v1 local-only: HTTP surface open on loopback. Opt-in bearer enforcement:
`GODMODE_REQUIRE_AUTH=1 GODMODE_TOKENS=<csv>`. Discovery per RFC9728:
`GET /.well-known/oauth-protected-resource`. Future IdP: `GODMODE_AUTH_SERVERS='["https://idp.example.com"]'`.

## Mods

`godmode.config.yaml` + `mods/<name>/{mod.json,hooks.js}` (`preCall/postCall`, throw-safe). `mods/policy-gates` confirms destructive evolve/force-release (MRTR elicitation).

## Licenses

MIT except `vendors/eve-miro/mirofish/` (AGPL-3.0) — see `NOTICE.md`. MIT-only: `GODMODE_NO_AGPL=1 node scripts/vendor.mjs`.
