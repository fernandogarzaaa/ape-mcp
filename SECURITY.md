# Security Policy

## Supported Versions

APE MCP is under active development. Security fixes are
provided on the latest published npm release and on the `main` branch.
Older releases are not patched.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| < latest| :x:                |

## Reporting a Vulnerability

Please do **not** open a public issue for a suspected vulnerability.

Report it privately:

- GitHub: use **Security > Report a vulnerability** on the
  [ape-mcp repository](https://github.com/fernandogarzaaa/ape-mcp/security)
  (private advisory), or
- Email: [fernandogarzaaa@gmail.com](mailto:fernandogarzaaa@gmail.com)
  with subject `[ape-mcp security]`.

Include:

1. A description of the vulnerability and its impact.
2. Steps to reproduce (commands, payloads, configuration).
3. Anything you have tried or that mitigates it.

You will receive an acknowledgment within 72 hours, and a plan for a fix
or a request for more information. Once a fix is released, reporters are
credited in the release notes unless they ask not to be.

## Scope

In scope: the `ape-mcp` npm package (`src/`, `bin/`, `vendors/` build
integration), the hosted remote endpoint configuration shipped in this
repo, and the bundled TUI/console.

Out of scope: third-party services, your own deployment credentials and
secrets (never share bearer tokens or API keys in a report; rotate any
that were exposed), and vulnerabilities in upstream dependencies without
a demonstrable path through APE (report those upstream; dependency bumps
are still welcome as PRs).
