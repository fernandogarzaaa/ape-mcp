# Security policy

## Reporting a vulnerability

Report privately through
[GitHub security advisories](https://github.com/fernandogarzaaa/ape-mcp/security/advisories/new).
Please do not open a public issue for a vulnerability.

Include what you would need to reproduce it yourself: version or commit,
engine or connector involved, and a minimal case. You should get an
initial response within a week.

## Supported versions

Only the latest published minor release receives security fixes. APE is
pre-1.0, so older minors are not patched — upgrade first, then report if
the issue persists.

## Scope notes

A few things about APE's design are worth knowing before reporting:

- **Agent runs execute real tools.** `ape_agent_run` runs a full reasoning
  loop that can call file, shell, network, and connector operations within
  its budgets and policy gates. Destructive actions are denied by default,
  but review the policy configuration before pointing APE at production
  systems or sensitive directories.
- **Connectors reach the network.** Declarative connectors call external
  HTTP endpoints with credentials from your configuration. Connector
  definitions are code: only install connector packs you trust, and do
  not commit files containing secrets.
- **The ledger records runs locally.** The `.ape/` directory holds run
  transcripts, costs, and outcomes, which may include data the agent
  touched. Treat it as sensitive and do not publish it without review.
- **The browser console is a local operator surface.** It assumes a
  trusted local user; do not expose it to a network.
- **Model keys live in local configuration.** APE borrows host-app model
  access or uses your Anthropic/OpenAI keys. Do not commit keys, and do
  not share logs that may contain them.
