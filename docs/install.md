# Install

APE is a single npm package. It installs into Claude, Codex, OpenCode, Cursor, Hermes, and
VSCode with one config entry.

## Requirements

- Node.js **>= 22.5** (uses the built-in `node:sqlite` — no native dependencies).
- Vendored engines ship in-package. Genesis and EVE need their own npm deps, installed
  automatically by the `postinstall` script on first `npm install` (no manual step).
  If that was skipped, run manually:
  `npm --prefix vendors/genesis install --ignore-scripts` and
  `npm --prefix vendors/eve install --ignore-scripts`.

## From npm

```bash
npm i -g ape-mcp
ape-mcp doctor        # engine build state + every sanctioned egress host
ape-mcp               # opens the browser console on 127.0.0.1 (auto port)
ape                   # terminal UI (needs a terminal; same as `ape-mcp tui`)
ape-mcp tui           # terminal UI via the operator CLI
```

> npm note (2026-10-25): `npm i -g ape-mcp` currently installs 1.1.2, the latest published release. Version 1.2.0 is tagged in this repo, but its npm publish is still waiting on owner approval, so it is not on npm yet. For 1.2.0, install from source below until the publish lands.

The TUI ships as a prebuilt binary for win-x64 (`vendors/ape-tui/win-x64/`);
on macOS/Linux it builds once from source on first launch (needs a Rust
toolchain), and CI prebuilts per platform are still open (M5 packaging).

## From source

```bash
git clone https://github.com/fernandogarzaaa/ape-mcp
cd ape-mcp
npm install
node bin/ape-mcp.js doctor
```

## ADAM memory on Linux/macOS

The ADAM memory tools (`ape_remember`, `ape_recall`, `ape_beliefs`) need a
platform binary. It ships prebuilt inside the repo for Windows only; on
Linux/macOS run once after install:

```bash
node scripts/fetch-adam.mjs   # downloads the release binary, checksum-verified
```

The fetch targets the release matching your `package.json` version and
refuses to install without a checksum proof (fail-closed). If it reports no
checksum available, build from the vendored source instead:
`cargo build --release -p adam-mcp` inside `vendors/adam`. `ape-mcp doctor`
reports which case you are in. Until one of those succeeds, the memory tools
answer `unavailable` with the same hint instead of failing silently.

Note: the `v1.1.2` release predates per-asset `.sha256` sidecars (the release
workflow now publishes them, so later versions verify automatically). For
`v1.1.2` you can pin the expected checksum explicitly instead of using the
cargo fallback:

```bash
APE_ADAM_SHA256=dc03c5e5d3bc5459c39d4ac2cc00fe1a671af303f360a7e3b4f4c288cdf075a5 \
  node scripts/fetch-adam.mjs   # linux-x64
```

Pins for `v1.1.2` (sha256 of the official release assets):
- `adam-mcp-linux-x64`: `dc03c5e5d3bc5459c39d4ac2cc00fe1a671af303f360a7e3b4f4c288cdf075a5`
- `adam-mcp-darwin-arm64`: `2b2ae0e093e2a40dec4e0ec23541ce27cb57eb6e1f2d771656005a5e23e84fe3`
- `adam-mcp-win-x64.exe`: `5058d5c3d9d6a12c799d24b02920c907ce4bfb31ffa5e4690351a0ea1f22278d`

## Add to a host

Point the host at the stdio server:

```json
{ "mcpServers": { "ape-mcp": { "command": "node", "args": ["<path-to>/bin/ape-mcp.js"] } } }
```

or HTTP: `ape-mcp --http 8787` (Streamable-ish endpoint, `Bearer` auth opt-in).

Manifests ship in-repo: `.claude-plugin/` (Claude), `.codex/skills/ape/` (Codex),
`.opencode/plugin.json` (OpenCode), `mcpServers.json` (Cursor/Windsurf/VSCode/Desktop).

## First agent run

Set a model provider key, then:

```bash
APE_ANTHROPIC_API_KEY=sk-... ape-mcp run ape_agent_run '{"profile":"repo-triage","objective":"Triage: build broken after dep bump"}'
```

Poll with `ape_agent_status {run_id}`. Without a key, use a local model:
`APE_LOCAL_BASE_URL=http://localhost:11434/v1` with a profile pointing at `provider: local`.